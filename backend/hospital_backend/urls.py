from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({'status': 'healthy', 'message': 'Hospital Backend API is running'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/', include('resources.db_urls')),  # Use direct database API URLs
    path('api/', include('resources.urls')),  # Include original URLs for auth endpoints
]