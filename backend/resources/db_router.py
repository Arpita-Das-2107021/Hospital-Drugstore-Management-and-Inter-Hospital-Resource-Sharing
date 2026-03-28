"""
Database Router for Hospital Resource Sharing System

This router handles connections between the resource sharing database
and dummy hospital system databases for synchronization.
"""

from django.conf import settings


class HospitalDatabaseRouter:
    """
    Database router to handle multiple hospital databases.
    
    Routes queries to appropriate databases based on model and
    hospital context.
    """
    
    # Apps that use the main resource sharing database
    resource_sharing_apps = {'resources', 'admin', 'auth', 'contenttypes', 'sessions', 'token_blacklist', 'authtoken'}
    
    # Apps that represent dummy hospital systems
    dummy_hospital_apps = {'dummy_hospital'}
    
    def db_for_read(self, model, **hints):
        """Suggest the database to read from."""
        app_label = model._meta.app_label
        
        if app_label in self.resource_sharing_apps:
            return 'default'
        elif app_label in self.dummy_hospital_apps:
            return 'dummy_hospital'
        
        # Check if there's a hospital-specific database hint
        if hints.get('hospital_db'):
            return hints['hospital_db']
        
        return None
    
    def db_for_write(self, model, **hints):
        """Suggest the database to write to."""
        app_label = model._meta.app_label
        
        if app_label in self.resource_sharing_apps:
            return 'default'
        elif app_label in self.dummy_hospital_apps:
            # Dummy hospital databases are read-only
            return None
        
        return None
    
    def allow_relation(self, obj1, obj2, **hints):
        """Allow relations between objects."""
        # Get the database aliases for both objects
        db1 = obj1._state.db
        db2 = obj2._state.db
        
        # Allow relations within the same database
        if db1 and db2:
            return db1 == db2
        
        return None
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """Determine if migration should run on this database."""
        if app_label in self.resource_sharing_apps:
            return db == 'default'
        elif app_label in self.dummy_hospital_apps:
            return db == 'dummy_hospital'
        elif db in ['default', 'dummy_hospital']:
            return False
        
        return None


class ReadOnlyDummyHospitalRouter:
    """
    Router to ensure dummy hospital databases remain read-only.
    """
    
    def db_for_write(self, model, **hints):
        """Prevent writes to dummy hospital databases."""
        if hasattr(model._meta, 'app_label'):
            app_label = model._meta.app_label
            if 'dummy' in app_label.lower() or 'hospital' in app_label.lower():
                return None  # No writes allowed
        return None
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """Prevent migrations on dummy hospital databases."""
        if 'dummy' in db or 'hospital' in db:
            return False
        return None
