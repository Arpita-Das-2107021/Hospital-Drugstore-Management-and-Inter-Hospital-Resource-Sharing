import csv

from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.permissions.base import CanManageHospitalCommunication
from common.permissions.realtime import SOCKET_TYPE_CHAT, filter_socket_eligible_user_ids
from common.utils.response import success_response

from common.utils.pagination import StandardResultsPagination
from .models import ChatAuditEvent

from .serializers import (
    ChatAuditEventSerializer,
    ChatAttachmentUploadSerializer,
    ChatDeleteMessageSerializer,
    ChatMessageHistorySerializer,
    ChatMessageSyncQuerySerializer,
    ChatReadReceiptSerializer,
    DirectConversationOpenSerializer,
    DirectConversationSummarySerializer,
)
from .services import (
    create_attachment,
    create_message,
    delete_conversation_for_user,
    delete_message_for_user,
    get_chat_unread_summary,
    get_chat_unread_summary_for_user_id,
    get_unread_counts_for_conversations,
    get_unread_count,
    get_conversation_for_user,
    list_direct_conversations_for_user,
    mark_read,
    open_direct_conversation,
    serialize_message_for_export,
    visible_messages_queryset,
)


def _emit_chat_read_and_unread_updates(*, conversation, actor, participant, source_event: str) -> None:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        f"chat_conversation_{conversation.id}",
        {
            "type": "chat.event",
            "event": "message.read",
            "payload": {
                "conversation_id": str(conversation.id),
                "user_id": str(actor.id),
                "last_read_message_id": str(participant.last_read_message_id) if participant.last_read_message_id else None,
                "last_read_at": participant.last_read_at.isoformat() if participant.last_read_at else None,
            },
        },
    )

    participant_ids = list(conversation.participants.values_list("user_id", flat=True))
    eligible_participant_ids = filter_socket_eligible_user_ids(
        socket_type=SOCKET_TYPE_CHAT,
        user_ids=participant_ids,
    )
    for participant_id in eligible_participant_ids:
        summary = get_chat_unread_summary_for_user_id(user_id=participant_id)
        summary_payload = {
            **summary,
            "conversation_id": str(conversation.id),
            "source_event": source_event,
        }
        async_to_sync(channel_layer.group_send)(
            f"chat_user_{participant_id}",
            {
                "type": "chat.event",
                "event": "unread_count.updated",
                "payload": summary_payload,
            },
        )


class DirectConversationOpenAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = DirectConversationOpenSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        direct_conversation, created = open_direct_conversation(
            actor=request.user,
            participant_id=serializer.validated_data["participant_id"],
        )
        output = DirectConversationSummarySerializer(direct_conversation, context={"request": request}).data
        return Response(
            success_response(data=output),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DirectConversationListAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = DirectConversationSummarySerializer
    pagination_class = StandardResultsPagination

    def get(self, request):
        queryset = list_direct_conversations_for_user(user=request.user).order_by("-conversation__updated_at")
        page = self.paginate_queryset(queryset)

        target_items = list(page) if page is not None else list(queryset)
        unread_count_map = get_unread_counts_for_conversations(
            user=request.user,
            conversation_ids=[item.conversation_id for item in target_items],
        )
        serializer_context = self.get_serializer_context()
        serializer_context["unread_count_map"] = unread_count_map
        serializer = self.get_serializer(target_items, many=True, context=serializer_context)

        if page is not None:
            return self.get_paginated_response(serializer.data)

        return Response(success_response(data=serializer.data))


class ChatGlobalUnreadCountAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]

    def get(self, request):
        summary = get_chat_unread_summary(user=request.user)
        return Response(success_response(data=summary))


class ChatConversationMessageHistoryAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatMessageHistorySerializer
    pagination_class = StandardResultsPagination

    def get(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        queryset = (
            visible_messages_queryset(conversation=conversation, user=request.user)
            .select_related("sender")
            .prefetch_related("attachments")
            .order_by("created_at")
        )

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True, context={"request": request, "user": request.user})

        if page is not None:
            return self.get_paginated_response(serializer.data)

        return Response(
            {
                "data": serializer.data,
                "error": None,
                "meta": {},
            }
        )


class ChatConversationMessageSyncAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatMessageHistorySerializer

    def get(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)

        query_serializer = ChatMessageSyncQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        after_message_id = query_serializer.validated_data["after"]

        anchor_message = (
            visible_messages_queryset(conversation=conversation, user=request.user)
            .filter(id=after_message_id)
            .only("id", "created_at")
            .first()
        )
        if not anchor_message:
            raise NotFound("Anchor message not found in conversation.")

        queryset = (
            visible_messages_queryset(conversation=conversation, user=request.user)
            .filter(created_at__gt=anchor_message.created_at)
            .select_related("sender")
            .prefetch_related("attachments")
            .order_by("created_at")
        )
        serializer = self.get_serializer(queryset, many=True, context={"request": request, "user": request.user})

        return Response(
            {
                "data": serializer.data,
                "error": None,
            }
        )


class ChatAttachmentUploadAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatAttachmentUploadSerializer

    def post(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        body = serializer.validated_data.get("body", "").strip()
        upload = serializer.validated_data["file"]
        media_kind = serializer.validated_data.get("media_kind")

        message = create_message(
            conversation=conversation,
            sender=request.user,
            body=body or "",
        )
        attachment = create_attachment(
            message=message,
            file=upload,
            uploaded_by=request.user,
            content_type=getattr(upload, "content_type", "application/octet-stream"),
            original_name=upload.name,
            media_kind_hint=media_kind,
        )

        message.refresh_from_db()
        payload = ChatMessageHistorySerializer(
            message,
            context={"request": request, "user": request.user},
        ).data

        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"chat_conversation_{conversation.id}",
            {
                "type": "chat.event",
                "event": "message.created",
                "payload": payload,
            },
        )

        return Response(
            {
                "data": {
                    "message": payload,
                    "attachment_id": str(attachment.id),
                },
                "error": None,
                "meta": {},
            },
            status=status.HTTP_201_CREATED,
        )


class ChatConversationUnreadCountAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]

    def get(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        unread_count = get_unread_count(conversation=conversation, user=request.user)
        return Response(success_response(data={"conversation_id": str(conversation.id), "unread_count": unread_count}))


class ChatConversationReadAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatReadReceiptSerializer

    def post(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        last_read_message_id = serializer.validated_data.get("last_read_message_id")
        if not last_read_message_id:
            last_read_message_id = serializer.validated_data.get("message_id")

        participant = mark_read(
            conversation=conversation,
            user=request.user,
            last_read_message_id=last_read_message_id,
        )
        unread_count = get_unread_count(conversation=conversation, user=request.user)
        _emit_chat_read_and_unread_updates(
            conversation=conversation,
            actor=request.user,
            participant=participant,
            source_event="message.read",
        )

        return Response(
            success_response(
                data={
                    "conversation_id": str(conversation.id),
                    "last_read_message_id": str(participant.last_read_message_id) if participant.last_read_message_id else None,
                    "last_read_at": participant.last_read_at.isoformat() if participant.last_read_at else None,
                    "unread_count": unread_count,
                }
            )
        )


class ChatDeleteMessageAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatDeleteMessageSerializer

    def post(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = delete_message_for_user(
            conversation=conversation,
            message_id=serializer.validated_data["message_id"],
            user=request.user,
            delete_for_everyone=serializer.validated_data.get("delete_for_everyone", False),
        )
        return Response(
            success_response(
                data={
                    "message_id": str(message.id),
                    "conversation_id": str(conversation.id),
                    "deleted_for_user": True,
                }
            ),
            status=status.HTTP_200_OK,
        )


class ChatDeleteConversationAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]

    def post(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        delete_conversation_for_user(conversation=conversation, user=request.user)
        return Response(
            success_response(
                data={
                    "conversation_id": str(conversation.id),
                    "deleted_for_user": True,
                }
            ),
            status=status.HTTP_200_OK,
        )


class ChatConversationAuditEventsAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]
    serializer_class = ChatAuditEventSerializer
    pagination_class = StandardResultsPagination

    def get(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        queryset = ChatAuditEvent.objects.filter(conversation=conversation).select_related("user", "message")
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(success_response(data=serializer.data))


class ChatConversationExportAPIView(GenericAPIView):
    permission_classes = [IsAuthenticated, CanManageHospitalCommunication]

    def get(self, request, conversation_id):
        conversation = get_conversation_for_user(conversation_id, request.user)
        fmt = (request.query_params.get("export_format") or "json").strip().lower()
        include_audit = (request.query_params.get("include_audit") or "false").lower() in {"1", "true", "yes"}

        messages = (
            visible_messages_queryset(conversation=conversation, user=request.user)
            .select_related("sender")
            .order_by("created_at")
        )
        serialized_messages = [serialize_message_for_export(message) for message in messages]

        audit_events = []
        if include_audit:
            audit_events = list(
                ChatAuditEvent.objects.filter(conversation=conversation)
                .select_related("user", "message")
                .values(
                    "id",
                    "event_type",
                    "conversation_id",
                    "message_id",
                    "user_id",
                    "created_at",
                    "metadata",
                )
            )

        if fmt == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="chat-{conversation.id}.csv"'
            writer = csv.writer(response)
            writer.writerow(["message_id", "conversation_id", "sender_id", "sender_email", "body", "created_at", "is_system"])
            for row in serialized_messages:
                writer.writerow(
                    [
                        row["id"],
                        row["conversation_id"],
                        row["sender_id"],
                        row["sender_email"],
                        row["body"],
                        row["created_at"],
                        row["is_system"],
                    ]
                )
            return response

        return Response(
            success_response(
                data={
                    "conversation_id": str(conversation.id),
                    "subject": conversation.subject,
                    "messages": serialized_messages,
                    "audit_events": audit_events,
                }
            )
        )
