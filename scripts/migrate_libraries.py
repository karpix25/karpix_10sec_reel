import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.v1.database.db_service import DBConnection, init_db

def migrate_libraries():
    print("Initializing DB to ensure schemas exist...")
    init_db()
    
    with DBConnection() as cursor:
        print("Fetching all clients...")
        cursor.execute("SELECT id, name FROM clients")
        clients = cursor.fetchall()
        
        for client in clients:
            client_id = client[0]
            client_name = client[1]
            
            # Check if there's already a library for this client
            cursor.execute("SELECT library_id FROM client_libraries WHERE client_id = %s LIMIT 1", (client_id,))
            existing_lib = cursor.fetchone()
            if existing_lib:
                print(f"Client '{client_name}' already linked to a library. Skipping creation.")
                continue
                
            print(f"Creating default library for '{client_name}'...")
            library_name = f"Библиотека: {client_name}"
            library_description = f"База знаний проекта {client_name}"
            
            cursor.execute("""
                INSERT INTO content_libraries (name, description)
                VALUES (%s, %s)
                RETURNING id
            """, (library_name, library_description))
            
            new_library_id = cursor.fetchone()[0]
            
            # Link library to client
            cursor.execute("""
                INSERT INTO client_libraries (client_id, library_id)
                VALUES (%s, %s)
            """, (client_id, new_library_id))
            
            print(f" -> Created Library ID {new_library_id} and linked to client.")
            
            # Migrate topic_cards
            cursor.execute("UPDATE topic_cards SET library_id = %s WHERE client_id = %s", (new_library_id, client_id))
            
            # Migrate structure_cards
            cursor.execute("UPDATE structure_cards SET library_id = %s WHERE client_id = %s", (new_library_id, client_id))
            
            # Migrate topic_structure_pairs
            cursor.execute("UPDATE topic_structure_pairs SET library_id = %s WHERE client_id = %s", (new_library_id, client_id))
            
            print(f" -> Updated existing cards to use Library ID {new_library_id}.")
            
    print("Library Migration complete!")

if __name__ == "__main__":
    migrate_libraries()
