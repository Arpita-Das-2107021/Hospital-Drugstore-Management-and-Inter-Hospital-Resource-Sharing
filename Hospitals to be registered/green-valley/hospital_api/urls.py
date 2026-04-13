from django.urls import path

from . import views

urlpatterns = [
    path(
        "mock-hospitals/green-valley/api/inventory/resources",
        views.inventory_resources,
        name="green_valley_inventory_resources",
    ),
    path(
        "mock-hospitals/green-valley/api/beds",
        views.beds,
        name="green_valley_beds",
    ),
    path(
        "mock-hospitals/green-valley/api/blood",
        views.blood,
        name="green_valley_blood",
    ),
    path(
        "mock-hospitals/green-valley/api/staff",
        views.staff,
        name="green_valley_staff",
    ),
    path(
        "mock-hospitals/green-valley/api/sales",
        views.sales,
        name="green_valley_sales",
    ),
]
