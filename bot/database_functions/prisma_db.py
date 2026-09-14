import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from database_functions.db_connection import get_connection, DB_PATH, row_to_dict


class PrismaDB:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or str(DB_PATH)
        self.ensure_db_exists()
    
    def ensure_db_exists(self):
        db_dir = os.path.dirname(self.db_path)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
    
    def get_connection(self):
        return get_connection()
    
    def get_user_by_telegram_id(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM User WHERE telegramId = ?
            """, (telegram_id,))
            
            row = cursor.fetchone()
            return row_to_dict(row)
        finally:
            conn.close()
    
    def create_user(self, telegram_id: int, username: Optional[str] = None,
                   first_name: Optional[str] = None, last_name: Optional[str] = None) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO User (telegramId, username, firstName, lastName, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (telegram_id, username, first_name, last_name, datetime.now(), datetime.now()))
            
            user_id = cursor.lastrowid
            conn.commit()
            return user_id
        finally:
            conn.close()
    
    def create_listing(self, user_id: int, title: str, description: str, price: str,
                      category: str, location: str, images: List[str],
                      subcategory: Optional[str] = None, is_free: bool = False,
                      condition: Optional[str] = None, tags: Optional[List[str]] = None) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        images_json = json.dumps(images)
        tags_json = json.dumps(tags) if tags else None
        
        try:
            cursor.execute("""
                INSERT INTO Listing (
                    userId, title, description, price, isFree, category, subcategory,
                    condition, location, images, tags, status, createdAt, updatedAt
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, title, description, price, is_free, category, subcategory,
                condition, location, images_json, tags_json, 'pending',
                datetime.now(), datetime.now()
            ))
            
            listing_id = cursor.lastrowid
            conn.commit()
            return listing_id
        finally:
            conn.close()
    
    def get_listing_by_id(self, listing_id: int) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT l.*, u.username, u.firstName, u.lastName, CAST(u.telegramId AS INTEGER) as sellerTelegramId
                FROM Listing l
                JOIN User u ON l.userId = u.id
                WHERE l.id = ?
            """, (listing_id,))
            
            return row_to_dict(cursor.fetchone())
        finally:
            conn.close()
    
    def get_user_by_telegram_id_with_profile(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT 
                    u.*,
                    COUNT(DISTINCT l.id) as totalListings,
                    COUNT(DISTINCT CASE WHEN l.status = 'active' THEN l.id END) as activeListings,
                    COUNT(DISTINCT CASE WHEN l.status = 'sold' THEN l.id END) as soldListings
                FROM User u
                LEFT JOIN Listing l ON u.id = l.userId
                WHERE CAST(u.telegramId AS INTEGER) = ?
                GROUP BY u.id
            """, (telegram_id,))
            
            return row_to_dict(cursor.fetchone())
        finally:
            conn.close()
    
    def get_listings(self, category: Optional[str] = None,
                    subcategory: Optional[str] = None,
                    is_free: Optional[bool] = None,
                    limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM Listing WHERE status = 'active'"
        params = []
        
        if category:
            query += " AND category = ?"
            params.append(category)
        
        if subcategory:
            query += " AND subcategory = ?"
            params.append(subcategory)
        
        if is_free is not None:
            query += " AND isFree = ?"
            params.append(is_free)
        
        query += " ORDER BY createdAt DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        try:
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [row_to_dict(row) for row in rows if row_to_dict(row)]
        finally:
            conn.close()
    
    def update_user_balance(self, user_id: int, amount: float) -> bool:
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                UPDATE User SET balance = balance + ?, updatedAt = ?
                WHERE id = ?
            """, (amount, datetime.now(), user_id))
            
            success = cursor.rowcount > 0
            conn.commit()
            return success
        finally:
            conn.close()
