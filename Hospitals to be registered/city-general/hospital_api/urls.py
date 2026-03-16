from django.urls import path

from . import views

urlpatterns = [
    path(
        "mock-hospitals/city-general/api/inventory/resources",
        views.inventory_resources,
        name="city_general_inventory_resources",
    ),
    path(
        "mock-hospitals/city-general/api/beds",
        views.beds,
        name="city_general_beds",
    ),
    path(
        "mock-hospitals/city-general/api/blood",
        views.blood,
        name="city_general_blood",
    ),
    path(
        "mock-hospitals/city-general/api/staff",
        views.staff,
        name="city_general_staff",
    ),
]
