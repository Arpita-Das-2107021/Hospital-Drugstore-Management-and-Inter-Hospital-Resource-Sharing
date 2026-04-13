from django.urls import path

from . import views

urlpatterns = [
    path(
        "mock-hospitals/sunrise-health/api/inventory/resources",
        views.inventory_resources,
        name="sunrise_health_inventory_resources",
    ),
    path(
        "mock-hospitals/sunrise-health/api/beds",
        views.beds,
        name="sunrise_health_beds",
    ),
    path(
        "mock-hospitals/sunrise-health/api/blood",
        views.blood,
        name="sunrise_health_blood",
    ),
    path(
        "mock-hospitals/sunrise-health/api/staff",
        views.staff,
        name="sunrise_health_staff",
    ),
    path(
        "mock-hospitals/sunrise-health/api/sales",
        views.sales,
        name="sunrise_health_sales",
    ),
]
