import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.v1.database.db_service import DBConnection, init_db

def migrate_products():
    print("Initializing DB to ensure schemas exist...")
    init_db()
    
    with DBConnection() as cursor:
        print("Fetching all clients...")
        cursor.execute("SELECT id, name, product_info, product_keyword, product_video_url, product_media_assets FROM clients")
        clients = cursor.fetchall()
        
        for client in clients:
            client_id = client[0]
            client_name = client[1]
            product_info = client[2]
            product_keyword = client[3]
            product_video_url = client[4]
            product_media_assets = client[5]
            
            # Check if this client already has any products
            cursor.execute("SELECT id FROM client_products WHERE client_id = %s", (client_id,))
            if cursor.fetchone():
                print(f"Client '{client_name}' already has products. Skipping.")
                continue
                
            print(f"Creating default product for '{client_name}'...")
            default_product_name = "Основной продукт"
            
            cursor.execute("""
                INSERT INTO client_products 
                (client_id, name, product_info, product_keyword, product_video_url, product_media_assets)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (client_id, default_product_name, product_info, product_keyword, product_video_url, product_media_assets))
            
            new_product_id = cursor.fetchone()[0]
            
            # Set as active product
            cursor.execute("UPDATE clients SET active_product_id = %s WHERE id = %s", (new_product_id, client_id))
            print(f" -> Created product ID {new_product_id} and set as active.")
            
    print("Migration complete!")

if __name__ == "__main__":
    migrate_products()
