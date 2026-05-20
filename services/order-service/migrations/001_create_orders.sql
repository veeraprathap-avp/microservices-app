-- 001_create_orders.sql
-- Run via: node src/db/migrate.js

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'orders_db')
BEGIN
    CREATE DATABASE orders_db;
END
GO

USE orders_db;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'orders')
BEGIN
    CREATE TABLE orders (
        id          NVARCHAR(36)    NOT NULL PRIMARY KEY,
        user_id     NVARCHAR(36)    NOT NULL,
        status      NVARCHAR(20)    NOT NULL DEFAULT 'pending'
                        CONSTRAINT CK_Orders_Status CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
        total       DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
        notes       NVARCHAR(500)   NULL,
        created_at  DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        updated_at  DATETIME2       NULL
    );

    CREATE INDEX IX_Orders_UserId ON orders(user_id);
    CREATE INDEX IX_Orders_Status ON orders(status);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'order_items')
BEGIN
    CREATE TABLE order_items (
        id          NVARCHAR(36)    NOT NULL PRIMARY KEY,
        order_id    NVARCHAR(36)    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id  NVARCHAR(36)    NOT NULL,
        product_name NVARCHAR(200)  NOT NULL,
        quantity    INT             NOT NULL CHECK (quantity > 0),
        unit_price  DECIMAL(10, 2)  NOT NULL CHECK (unit_price >= 0)
    );

    CREATE INDEX IX_OrderItems_OrderId ON order_items(order_id);
END
GO
