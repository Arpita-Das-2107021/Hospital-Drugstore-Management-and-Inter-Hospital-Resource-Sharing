"""Base DRF permission classes for HRSP."""
from rest_framework.permissions import BasePermission

ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
ROLE_PHARMACIST = "PHARMACIST"
ROLE_INVENTORY_MANAGER = "INVENTORY_MANAGER"
ROLE_DOCTOR = "DOCTOR"
ROLE_LOGISTICS_STAFF = "LOGISTICS_STAFF"
ROLE_HOSPITAL_STAFF = "STAFF"


def _user_has_role(user, *roles) -> bool:
    if not user or not user.is_authenticated:
        return False
    return user.roles.filter(name__in=roles).exists()


def _user_hospital_id(user):
    """Return the hospital UUID for the authenticated user."""
    try:
        return user.staff.hospital_id
    except AttributeError:
        return None


class IsSuperAdmin(BasePermission):
    """Allow access only to platform super admins."""

    def has_permission(self, request, view):
        return _user_has_role(request.user, ROLE_SUPER_ADMIN)


class IsHospitalAdmin(BasePermission):
    """Allow access only to hospital admins (or super admins)."""

    def has_permission(self, request, view):
        return _user_has_role(request.user, ROLE_HOSPITAL_ADMIN, ROLE_SUPER_ADMIN)


class IsPharmacist(BasePermission):
    def has_permission(self, request, view):
        return _user_has_role(request.user, ROLE_PHARMACIST, ROLE_INVENTORY_MANAGER, ROLE_SUPER_ADMIN)


class IsLogisticsStaff(BasePermission):
    def has_permission(self, request, view):
        return _user_has_role(request.user, ROLE_LOGISTICS_STAFF, ROLE_HOSPITAL_ADMIN, ROLE_SUPER_ADMIN)


class IsSameHospital(BasePermission):
    """
    Object-level permission: the requesting user must belong to the same hospital
    as the object being accessed. Views must call get_object() for this to run.
    """

    def has_object_permission(self, request, view, obj):
        user_hospital = _user_hospital_id(request.user)
        if not user_hospital:
            return False
        # Allow super_admin unrestricted access
        if _user_has_role(request.user, ROLE_SUPER_ADMIN):
            return True
        # Determine the hospital_id on the target object
        obj_hospital = getattr(obj, "hospital_id", None)
        if obj_hospital is None:
            obj_hospital = getattr(obj, "hospital", None)
            if obj_hospital is not None:
                obj_hospital = getattr(obj_hospital, "id", obj_hospital)
        return str(user_hospital) == str(obj_hospital)


class IsVerifiedHospital(BasePermission):
    """Allow access only to staff whose hospital is verified (or super admins)."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Super admins are not tied to a hospital — always allowed
        if _user_has_role(request.user, ROLE_SUPER_ADMIN):
            return True
        try:
            return request.user.staff.hospital.verified_status == "verified"
        except AttributeError:
            return False
