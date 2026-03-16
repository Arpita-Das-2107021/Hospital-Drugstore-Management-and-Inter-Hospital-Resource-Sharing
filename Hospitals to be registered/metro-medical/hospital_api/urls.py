from django.urls import path

from . import views

urlpatterns = [
    path(
        "mock-hospitals/metro-medical/api/inventory/resources",
        views.inventory_resources,
        name="metro_medical_inventory_resources",
    ),
    path(
        "mock-hospitals/metro-medical/api/beds",
        views.beds,
        name="metro_medical_beds",
    ),
    path(
        "mock-hospitals/metro-medical/api/blood",
        views.blood,
        name="metro_medical_blood",
    ),
    path(
        "mock-hospitals/metro-medical/api/staff",
        views.staff,
        name="metro_medical_staff",
    ),
    path(
        "mock-hospitals/metro-medical/api/token",
        views.token,
        name="metro_medical_token",
    ),
]
