"""Communications app views."""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Count
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import CanManageHospitalCommunication
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response
from apps.chat.services import get_unread_count, get_unread_counts_for_conversations

from .models import Conversation, MessageTemplate
from .serializers import (
    ConversationSerializer,
    ConversationParticipantManageSerializer,
    MessageSerializer,
    MessageTemplateSerializer,
    SendMessageSerializer,
)
from .services import create_conversation, mark_conversation_read, send_message

logger = logging.getLogger("hrsp.communications")


class ConversationReadPointerSerializer(serializers.Serializer):
    last_read_message_id = serializers.UUIDField(required=False)
    message_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        last_read_message_id = attrs.get("last_read_message_id")
        message_id = attrs.get("message_id")
        if last_read_message_id and message_id and last_read_message_id != message_id:
            raise serializers.ValidationError("Provide only one read pointer value.")
        return attrs


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        from apps.chat.models import ConversationVisibility

        hidden_ids = ConversationVisibility.objects.filter(user=self.request.user, is_deleted=True).values_list(
            "conversation_id", flat=True
        )
        return Conversation.objects.filter(
            participants__user=self.request.user
        ).exclude(id__in=hidden_ids).prefetch_related("participants").order_by("-updated_at")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        target_items = list(page) if page is not None else list(qs)

        unread_count_map = get_unread_counts_for_conversations(
            user=request.user,
            conversation_ids=[item.id for item in target_items],
        )
        serializer_context = self.get_serializer_context()
        serializer_context["unread_count_map"] = unread_count_map
        serializer = self.get_serializer(target_items, many=True, context=serializer_context)

        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(success_response(data=serializer.data))

    def retrieve(self, request, *args, **kwargs):
        conversation = self.get_object()
        unread_count_map = get_unread_counts_for_conversations(
            user=request.user,
            conversation_ids=[conversation.id],
        )
        serializer_context = self.get_serializer_context()
        serializer_context["unread_count_map"] = unread_count_map
        return Response(success_response(data=self.get_serializer(conversation, context=serializer_context).data))

    def create(self, request, *args, **kwargs):
        from apps.staff.models import Staff

        UserAccount = get_user_model()
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)

        participant_ids = request.data.get("participant_ids")
        if participant_ids is None:
            single_participant = request.data.get("participant_id")
            participant_ids = [single_participant] if single_participant else []

        if not isinstance(participant_ids, list):
            raise ValidationError({"participant_ids": "participant_ids must be an array of UUID values."})

        raw_ids = [str(value) for value in participant_ids if value]
        resolved_users = {
            str(user.id): user for user in UserAccount.objects.filter(id__in=raw_ids)
        }

        unresolved_ids = [value for value in raw_ids if value not in resolved_users]
        if unresolved_ids:
            for staff in Staff.objects.filter(id__in=unresolved_ids).select_related("user_account"):
                if getattr(staff, "user_account", None):
                    resolved_users[str(staff.user_account.id)] = staff.user_account

        participants = [user for user in resolved_users.values() if user.id != request.user.id]
        if not participants:
            raise ValidationError({"participant_ids": "At least one other participant is required."})

        if len(participants) == 1:
            target_user = participants[0]
            requested_resource_request = s.validated_data.get("resource_request")
            candidate_conversation_ids = (
                Conversation.objects.filter(resource_request=requested_resource_request, participants__user__in=[request.user, target_user])
                .annotate(
                    matched_users=Count("participants__user", distinct=True),
                    participant_count=Count("participants", distinct=True),
                )
                .filter(matched_users=2, participant_count=2)
                .values_list("id", flat=True)
            )
            existing_private = Conversation.objects.filter(id__in=candidate_conversation_ids).order_by("-updated_at").first()
            if existing_private:
                return Response(success_response(data=ConversationSerializer(existing_private).data), status=status.HTTP_200_OK)

        subject = (s.validated_data.get("subject") or "").strip()
        if (not subject or subject.lower() == "new conversation") and len(participants) == 1:
            target = participants[0]
            subject = target.get_full_name().strip() or target.email

        conversation = create_conversation(
            subject=subject,
            participant_users=participants,
            actor=request.user,
            resource_request=s.validated_data.get("resource_request"),
        )
        return Response(success_response(data=ConversationSerializer(conversation).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Use message endpoints to communicate."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        return Response(success_response(data={"detail": "Conversations cannot be deleted."}),
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        conversation = self.get_object()
        if request.method == "GET":
            from apps.chat.services import visible_messages_queryset

            msgs = visible_messages_queryset(conversation=conversation, user=request.user)
            page = self.paginate_queryset(msgs)
            if page is not None:
                return self.get_paginated_response(MessageSerializer(page, many=True, context={"request": request}).data)
            return Response(success_response(data=MessageSerializer(msgs, many=True, context={"request": request}).data))

        s = SendMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        message = send_message(conversation, s.validated_data["body"], request.user)
        return Response(success_response(data=MessageSerializer(message, context={"request": request}).data), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        serializer = ConversationReadPointerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        last_read_message_id = serializer.validated_data.get("last_read_message_id")
        if not last_read_message_id:
            last_read_message_id = serializer.validated_data.get("message_id")

        participant = mark_conversation_read(
            conversation,
            request.user,
            last_read_message_id=last_read_message_id,
        )
        unread_count = get_unread_count(conversation=conversation, user=request.user)

        return Response(
            success_response(
                data={
                    "detail": "Marked as read.",
                    "conversation_id": str(conversation.id),
                    "last_read_message_id": (
                        str(participant.last_read_message_id) if participant.last_read_message_id else None
                    ),
                    "last_read_at": participant.last_read_at.isoformat() if participant.last_read_at else None,
                    "unread_count": unread_count,
                }
            )
        )

    @action(detail=True, methods=["get"], url_path="unread-count")
    def unread_count(self, request, pk=None):
        conversation = self.get_object()
        unread_count = get_unread_count(conversation=conversation, user=request.user)
        return Response(success_response(data={"conversation_id": str(conversation.id), "unread_count": unread_count}))

    @action(detail=True, methods=["post"], url_path="participants/add")
    def add_participants(self, request, pk=None):
        from apps.staff.models import Staff

        conversation = self.get_object()
        serializer = ConversationParticipantManageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        requester_membership = conversation.participants.filter(user=request.user).exists()
        if not requester_membership:
            raise ValidationError({"detail": "Not a participant."})

        raw_ids = [str(value) for value in serializer.validated_data["participant_ids"]]
        UserAccount = get_user_model()
        resolved_users = {str(user.id): user for user in UserAccount.objects.filter(id__in=raw_ids)}
        unresolved_ids = [value for value in raw_ids if value not in resolved_users]
        if unresolved_ids:
            for staff in Staff.objects.filter(id__in=unresolved_ids).select_related("user_account"):
                if getattr(staff, "user_account", None):
                    resolved_users[str(staff.user_account.id)] = staff.user_account

        new_users = [user for user in resolved_users.values() if not conversation.participants.filter(user=user).exists()]
        for user in new_users:
            conversation.participants.create(user=user)

        return Response(success_response(data={"conversation_id": str(conversation.id), "added_count": len(new_users)}))

    @action(detail=True, methods=["post"], url_path="participants/remove")
    def remove_participants(self, request, pk=None):
        from apps.staff.models import Staff

        conversation = self.get_object()
        serializer = ConversationParticipantManageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        requester_membership = conversation.participants.filter(user=request.user).exists()
        if not requester_membership:
            raise ValidationError({"detail": "Not a participant."})

        raw_ids = [str(value) for value in serializer.validated_data["participant_ids"]]
        UserAccount = get_user_model()
        resolved_user_ids = set(UserAccount.objects.filter(id__in=raw_ids).values_list("id", flat=True))
        unresolved_ids = [value for value in raw_ids if value not in {str(value) for value in resolved_user_ids}]
        if unresolved_ids:
            for staff in Staff.objects.filter(id__in=unresolved_ids).select_related("user_account"):
                if getattr(staff, "user_account", None):
                    resolved_user_ids.add(staff.user_account.id)

        if request.user.id in resolved_user_ids:
            raise ValidationError({"participant_ids": "You cannot remove yourself from this endpoint."})

        current_count = conversation.participants.count()
        removable_ids = list(conversation.participants.filter(user_id__in=resolved_user_ids).values_list("user_id", flat=True))
        if current_count - len(removable_ids) < 2:
            raise ValidationError({"participant_ids": "A conversation must keep at least 2 participants."})

        removed, _ = conversation.participants.filter(user_id__in=resolved_user_ids).delete()
        return Response(success_response(data={"conversation_id": str(conversation.id), "removed_count": removed}))


class MessageTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = MessageTemplateSerializer
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        hospital = user.staff.hospital if hasattr(user, "staff") and user.staff else None
        if hospital:
            return MessageTemplate.objects.filter(hospital=hospital) | MessageTemplate.objects.filter(hospital=None)
        return MessageTemplate.objects.filter(hospital=None)

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        template = s.save(created_by=request.user)
        return Response(success_response(data=self.get_serializer(template).data), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        s = self.get_serializer(instance, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(success_response(data=s.data))

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response(success_response(data={"detail": "Template deleted."}))
