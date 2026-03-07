"""
Database Direct API Views for Hospital Resource Sharing System V2
Simple Django views that execute raw SQL queries directly
"""

from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response


def dictfetchall(cursor):
    """Return all rows from a cursor as a dict"""
    columns = [col[0] for col in cursor.description]
    return [
        dict(zip(columns, row))
        for row in cursor.fetchall()
    ]


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check_v2(request):
    """Health check endpoint for new database"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM hospital")
            hospital_count = cursor.fetchone()[0]
        
        return Response({
            'status': 'healthy',
            'message': 'Hospital Backend API V2 is running',
            'database': 'connected',
            'hospitals': hospital_count
        })
    except Exception as e:
        return Response({
            'status': 'unhealthy',
            'message': f'Database error: {str(e)}'
        }, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_hospitals(request):
    """Get all hospitals from the new database schema"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT 
                id, code, name, license_number, email, phone, address, 
                city, state, postal_code, status, verified_at, 
                created_at, updated_at
            FROM hospital 
            ORDER BY name
        """)
        hospitals = dictfetchall(cursor)
    
    return Response({
        'count': len(hospitals),
        'results': hospitals
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_hospital_by_id(request, hospital_id):
    """Get a specific hospital by ID from the new database schema"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT 
                id, code, name, license_number, email, phone, address, 
                city, state, postal_code, status, verified_at, 
                created_at, updated_at
            FROM hospital 
            WHERE id = %s
        """, [hospital_id])
        
        hospital_data = dictfetchall(cursor)
        if not hospital_data:
            return Response({'error': 'Hospital not found'}, status=404)
            
        hospital = hospital_data[0]
        
        # Get additional statistics for the hospital
        cursor.execute("""
            SELECT 
                (SELECT COUNT(*) FROM staff WHERE hospital_id = %s) as total_staff,
                (SELECT COUNT(*) FROM inventory WHERE hospital_id = %s) as total_inventory,
                (SELECT COUNT(*) FROM department WHERE hospital_id = %s) as total_departments
        """, [hospital_id, hospital_id, hospital_id])
        
        stats = dictfetchall(cursor)[0]
        hospital.update(stats)
    
    return Response(hospital)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_inventory(request):
    """Get inventory data from the new database schema"""
    hospital_id = request.query_params.get('hospital')
    search = request.query_params.get('search', '')
    category = request.query_params.get('category', '')
    
    query = """
        SELECT 
            i.id,
            h.name as hospital_name,
            h.id as hospital_id,
            r.code as resource_code,
            r.name as resource_name,
            r.type as resource_type,
            r.category as resource_category,
            r.unit as resource_unit,
            i.available_quantity,
            i.reserved_quantity,
            i.unit_price,
            i.reorder_level,
            i.max_level,
            i.batch_number,
            i.expiry_date,
            i.storage_location,
            i.last_updated,
            i.created_at,
            CASE 
                WHEN i.available_quantity <= i.reorder_level THEN 'LOW'
                WHEN i.available_quantity >= i.max_level * 0.8 THEN 'GOOD'
                ELSE 'MEDIUM'
            END as stock_status,
            CASE 
                WHEN i.expiry_date IS NOT NULL 
                AND i.expiry_date <= CURRENT_DATE + INTERVAL '90 days' 
                THEN true 
                ELSE false 
            END as is_expiring_soon,
            (i.available_quantity * i.unit_price) as total_value
        FROM inventory i
        JOIN hospital h ON i.hospital_id = h.id
        JOIN resource r ON i.resource_id = r.id
        WHERE i.deleted_at IS NULL
    """
    
    params = []
    
    if hospital_id:
        query += " AND i.hospital_id = %s"
        params.append(hospital_id)
        
    if search:
        query += " AND (r.name ILIKE %s OR r.code ILIKE %s)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param])
        
    if category and category != 'all':
        query += " AND r.category = %s"
        params.append(category)
    
    query += " ORDER BY i.last_updated DESC"
    
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        inventory = dictfetchall(cursor)
    
    return Response({
        'count': len(inventory),
        'results': inventory
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_inventory_analytics(request):
    """Get inventory analytics from the new database"""
    hospital_id = request.query_params.get('hospital')
    
    base_condition = "WHERE i.deleted_at IS NULL"
    params = []
    
    if hospital_id:
        base_condition += " AND i.hospital_id = %s"
        params.append(hospital_id)
    
    with connection.cursor() as cursor:
        # Get basic stats
        cursor.execute(f"""
            SELECT 
                COUNT(*) as total_items,
                SUM(i.available_quantity * i.unit_price) as total_value,
                COUNT(CASE WHEN i.available_quantity <= i.reorder_level THEN 1 END) as low_stock_items,
                COUNT(CASE WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as expiring_items
            FROM inventory i
            JOIN hospital h ON i.hospital_id = h.id
            JOIN resource r ON i.resource_id = r.id
            {base_condition}
        """, params)
        
        analytics = dictfetchall(cursor)[0]
        
    return Response(analytics)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_resource_requests(request):
    """Get resource requests from the new database"""
    hospital_id = request.query_params.get('hospital')
    status = request.query_params.get('status', '')
    
    query = """
        SELECT 
            rr.id,
            rr.request_number,
            rr.status,
            rr.priority,
            rr.requested_quantity,
            rr.approved_quantity,
            rr.notes,
            rr.requested_date,
            rr.approved_at,
            rr.completed_at,
            rr.created_at,
            rh.name as requesting_hospital,
            sh.name as supplying_hospital,
            r.name as resource_name,
            r.code as resource_code
        FROM resource_request rr
        JOIN hospital rh ON rr.requesting_hospital_id = rh.id
        LEFT JOIN hospital sh ON rr.supplying_hospital_id = sh.id
        JOIN resource r ON rr.resource_id = r.id
        WHERE 1=1
    """
    
    params = []
    
    if hospital_id:
        query += " AND (rr.requesting_hospital_id = %s OR rr.supplying_hospital_id = %s)"
        params.extend([hospital_id, hospital_id])
    
    if status and status != 'all':
        query += " AND rr.status = %s"
        params.append(status.upper())
    
    query += " ORDER BY rr.created_at DESC"
    
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        requests = dictfetchall(cursor)
    
    return Response({
        'count': len(requests),
        'results': requests
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_staff(request):
    """Get staff from the new database"""
    hospital_id = request.query_params.get('hospital')
    
    query = """
        SELECT 
            s.id,
            s.employee_code,
            s.first_name,
            s.last_name,
            s.first_name || ' ' || s.last_name as full_name,
            s.email,
            s.phone,
            s.designation,
            s.specialization,
            s.license_number,
            s.employment_status,
            s.hire_date,
            s.years_experience,
            h.name as hospital_name,
            d.name as department_name,
            s.created_at,
            s.updated_at
        FROM staff s
        JOIN hospital h ON s.hospital_id = h.id
        JOIN department d ON s.department_id = d.id
        WHERE s.deleted_at IS NULL
    """
    
    params = []
    
    if hospital_id:
        query += " AND s.hospital_id = %s"
        params.append(hospital_id)
    
    query += " ORDER BY s.first_name, s.last_name"
    
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        staff = dictfetchall(cursor)
    
    return Response({
        'count': len(staff),
        'results': staff
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_hospital_dashboard(request, hospital_id):
    """Get dashboard data for a specific hospital"""
    with connection.cursor() as cursor:
        # Basic statistics
        cursor.execute("""
            SELECT 
                (SELECT COUNT(*) FROM staff WHERE hospital_id = %s AND deleted_at IS NULL) as total_staff,
                (SELECT COUNT(*) FROM staff WHERE hospital_id = %s AND employment_status = 'ACTIVE' AND deleted_at IS NULL) as active_staff,
                (SELECT COUNT(*) FROM department WHERE hospital_id = %s AND deleted_at IS NULL) as total_departments,
                (SELECT COUNT(*) FROM inventory WHERE hospital_id = %s AND deleted_at IS NULL) as total_inventory_items,
                (SELECT SUM(available_quantity * unit_price) FROM inventory WHERE hospital_id = %s AND deleted_at IS NULL) as total_inventory_value,
                (SELECT COUNT(*) FROM resource_request WHERE (requesting_hospital_id = %s OR supplying_hospital_id = %s) AND status = 'PENDING') as pending_requests,
                (SELECT COUNT(*) FROM resource_request WHERE (requesting_hospital_id = %s OR supplying_hospital_id = %s) AND status = 'COMPLETED' AND DATE(completed_at) = CURRENT_DATE) as completed_requests_today
        """, [hospital_id] * 9)
        
        dashboard_data = dictfetchall(cursor)[0]
        
        # Recent requests
        cursor.execute("""
            SELECT 
                rr.id, rr.request_number, rr.status, rr.priority, rr.created_at,
                CASE 
                    WHEN rr.requesting_hospital_id = %s THEN sh.name
                    ELSE rh.name
                END as other_hospital
            FROM resource_request rr
            LEFT JOIN hospital rh ON rr.requesting_hospital_id = rh.id
            LEFT JOIN hospital sh ON rr.supplying_hospital_id = sh.id
            WHERE rr.requesting_hospital_id = %s OR rr.supplying_hospital_id = %s
            ORDER BY rr.created_at DESC
            LIMIT 5
        """, [hospital_id, hospital_id, hospital_id])
        
        dashboard_data['recent_requests'] = dictfetchall(cursor)
        
        # Low stock alerts
        cursor.execute("""
            SELECT 
                i.id, r.name as resource_name, r.code as resource_code,
                i.available_quantity, i.reorder_level, i.storage_location
            FROM inventory i
            JOIN resource r ON i.resource_id = r.id
            WHERE i.hospital_id = %s 
            AND i.available_quantity <= i.reorder_level
            AND i.deleted_at IS NULL
            ORDER BY (i.available_quantity / i.reorder_level)
            LIMIT 10
        """, [hospital_id])
        
        dashboard_data['inventory_alerts'] = dictfetchall(cursor)
        
        # Convert any Decimal values to float for JSON serialization
        for key, value in dashboard_data.items():
            if hasattr(value, 'quantize'):  # Decimal type
                dashboard_data[key] = float(value) if value else 0
    
    return Response(dashboard_data)