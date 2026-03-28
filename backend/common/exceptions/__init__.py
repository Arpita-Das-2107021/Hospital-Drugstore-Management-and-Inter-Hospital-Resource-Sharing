"""Domain-specific exception classes."""


class HRSPBaseException(Exception):
    """Base class for all HRSP domain exceptions."""

    default_message = "An error occurred."

    def __init__(self, message: str = None):
        self.message = message or self.default_message
        super().__init__(self.message)


class BusinessRuleViolation(HRSPBaseException):
    """Raised when a business rule is violated (e.g. insufficient inventory)."""

    default_message = "Business rule violation."


class ResourceConflict(HRSPBaseException):
    """Raised when a resource is in a conflicting state."""

    default_message = "Resource conflict."


class TokenExpiredError(HRSPBaseException):
    """Raised when a time-limited token has expired."""

    default_message = "Token has expired."


class TokenAlreadyUsedError(HRSPBaseException):
    """Raised when a single-use token is used more than once."""

    default_message = "Token has already been used."


class InsufficientQuantityError(BusinessRuleViolation):
    """Raised when a requested quantity exceeds available inventory."""

    default_message = "Insufficient quantity available."


class UnauthorizedHospitalAccess(HRSPBaseException):
    """Raised when a staff member attempts to access another hospital's data."""

    default_message = "You do not have access to this hospital's data."
