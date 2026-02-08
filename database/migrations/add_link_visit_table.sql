-- Таблиця для фіксації переходів по посиланнях (linktowatch та ref)
CREATE TABLE IF NOT EXISTS LinkVisit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    visitor_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_link_visit_source ON LinkVisit(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_link_visit_visitor ON LinkVisit(visitor_user_id);
