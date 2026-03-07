"""
Script to export all database tables and their data
"""
import os
import django
import sys
from datetime import datetime

# Setup Django
sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hospital_backend.settings')
django.setup()

from django.db import connection
from django.apps import apps
import json

def export_database():
    output = []
    output.append("=" * 100)
    output.append("HOSPITAL RESOURCE SHARING SYSTEM - DATABASE EXPORT")
    output.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output.append("=" * 100)
    output.append("")
    
    # Get all tables from information_schema
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        all_tables = [row[0] for row in cursor.fetchall()]
    
    output.append(f"Total Tables Found: {len(all_tables)}")
    output.append("")
    
    # Export each table
    for table_name in all_tables:
        output.append("\n" + "=" * 100)
        output.append(f"TABLE: {table_name}")
        output.append("=" * 100)
        
        with connection.cursor() as cursor:
            # Get column information
            cursor.execute(f"""
                SELECT column_name, data_type, character_maximum_length, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            
            output.append("\nCOLUMNS:")
            output.append("-" * 100)
            for col in columns:
                col_name, data_type, max_length, nullable = col
                length_str = f"({max_length})" if max_length else ""
                null_str = "NULL" if nullable == 'YES' else "NOT NULL"
                output.append(f"  - {col_name}: {data_type}{length_str} {null_str}")
            
            # Get row count
            cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
            row_count = cursor.fetchone()[0]
            output.append(f"\nTotal Rows: {row_count}")
            
            if row_count > 0:
                # Get all data
                cursor.execute(f"SELECT * FROM {table_name} LIMIT 1000;")
                rows = cursor.fetchall()
                column_names = [desc[0] for desc in cursor.description]
                
                output.append("\nDATA:")
                output.append("-" * 100)
                
                # Add header
                output.append(" | ".join(column_names))
                output.append("-" * 100)
                
                # Add data rows
                for row in rows:
                    row_str = []
                    for value in row:
                        if value is None:
                            row_str.append("NULL")
                        elif isinstance(value, (datetime, )):
                            row_str.append(str(value))
                        elif isinstance(value, dict):
                            row_str.append(json.dumps(value))
                        elif isinstance(value, list):
                            row_str.append(json.dumps(value))
                        else:
                            row_str.append(str(value))
                    output.append(" | ".join(row_str))
                
                if row_count > 1000:
                    output.append(f"\n... ({row_count - 1000} more rows not shown)")
            else:
                output.append("\nNo data in this table.")
        
        output.append("")
    
    # Summary statistics
    output.append("\n" + "=" * 100)
    output.append("SUMMARY STATISTICS")
    output.append("=" * 100)
    
    with connection.cursor() as cursor:
        for table_name in all_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
            count = cursor.fetchone()[0]
            output.append(f"{table_name}: {count} rows")
    
    return "\n".join(output)

if __name__ == "__main__":
    try:
        result = export_database()
        # Save to file
        with open('/app/database_export.txt', 'w', encoding='utf-8') as f:
            f.write(result)
        print("Database export completed successfully!")
        print("File saved to: /app/database_export.txt")
    except Exception as e:
        print(f"Error during export: {e}")
        import traceback
        traceback.print_exc()
