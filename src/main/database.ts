import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { Producto, CreateSaleData, BackupFile } from '../shared/types'
import { logger } from './logger'

// ─── Migration System ────────────────────────────────────────────────────────

/**
 * The version the current codebase requires.
 * Increment this whenever you add a new migration to the array below.
 */
const REQUIRED_SCHEMA_VERSION = 2

interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

/**
 * List of all migrations, ordered by version number.
 * Each migration MUST be idempotent (safe to run twice) and encapsulated
 * in its own SQLite transaction (handled automatically by runMigrations).
 *
 * Version 1 = the initial schema (Producto, Venta, VentaItem, User + seed).
 * Future migrations start at version 2.
 */
const migrations: Migration[] = [
  {
    version: 1,
    description: 'Schema inicial: Producto, Venta, VentaItem, User y seed de usuarios',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS Producto (
          id          TEXT PRIMARY KEY,
          nombre      TEXT NOT NULL,
          descripcion TEXT,
          stockActual INTEGER NOT NULL DEFAULT 0,
          stockMinimo INTEGER NOT NULL DEFAULT 0,
          activo      INTEGER NOT NULL DEFAULT 1,
          createdAt   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS Venta (
          id    TEXT PRIMARY KEY,
          total REAL NOT NULL,
          fecha TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS VentaItem (
          id             TEXT PRIMARY KEY,
          ventaId        TEXT NOT NULL,
          productoId     TEXT NOT NULL,
          cantidad       INTEGER NOT NULL,
          precioUnitario REAL NOT NULL,
          FOREIGN KEY(ventaId)    REFERENCES Venta(id),
          FOREIGN KEY(productoId) REFERENCES Producto(id)
        );

        CREATE TABLE IF NOT EXISTS User (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          username     TEXT UNIQUE NOT NULL,
          passwordHash TEXT NOT NULL,
          role         TEXT NOT NULL CHECK(role IN ('admin', 'vendedor')),
          activo       INTEGER NOT NULL DEFAULT 1
        );
      `)

      // Seed initial users only if the table is empty
      const userCount = db.prepare('SELECT COUNT(*) as count FROM User').get() as { count: number }
      if (userCount.count === 0) {
        const bcrypt = require('bcryptjs')
        const salt = bcrypt.genSaltSync(10)
        const insert = db.prepare('INSERT INTO User (username, passwordHash, role) VALUES (?, ?, ?)')
        insert.run('admin', bcrypt.hashSync('admin123', salt), 'admin')
        insert.run('vendedor', bcrypt.hashSync('vendedor123', salt), 'vendedor')
        console.log('[migrations] Usuarios iniciales creados (admin, vendedor).')
      }
    }
  },
  {
    version: 2,
    description: 'Añade fecha_eliminacion a Producto y producto_nombre a VentaItem',
    up: (db) => {
      // 1. Agregar fecha_eliminacion a Producto (TEXT NULL)
      try {
        db.exec('ALTER TABLE Producto ADD COLUMN fecha_eliminacion TEXT DEFAULT NULL')
      } catch (err: any) {
        if (!err.message.includes('duplicate column name')) throw err;
      }

      // 2. Agregar producto_nombre a VentaItem (TEXT)
      try {
        db.exec('ALTER TABLE VentaItem ADD COLUMN producto_nombre TEXT DEFAULT NULL')
      } catch (err: any) {
        if (!err.message.includes('duplicate column name')) throw err;
      }

      // 3. Poblar histórico de VentaItem con los nombres actuales de Producto
      db.exec(`
        UPDATE VentaItem 
        SET producto_nombre = (
          SELECT nombre 
          FROM Producto 
          WHERE Producto.id = VentaItem.productoId
        )
        WHERE producto_nombre IS NULL
      `)
      console.log('[migrations] Histórico de nombres de productos actualizado en VentaItem.')
    }
  }
]

/**
 * Ensures the schema_version table exists and returns the current version.
 * If the table is new, it means this is a fresh DB, so we insert version 0
 * so that all migrations (starting at v1) will be applied.
 */
function getCurrentVersion(db: Database.Database): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )
  `)

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined

  if (!row) {
    // Fresh schema_version table → start from 0 so all migrations run
    db.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
    return 0
  }

  return row.version
}

/**
 * Runs all pending migrations in order, each in its own transaction.
 * Updates schema_version after each successful migration.
 */
function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db)

  if (currentVersion >= REQUIRED_SCHEMA_VERSION) {
    console.log(`[migrations] Esquema actualizado (v${currentVersion}). Sin pendientes.`)
    return
  }

  const pending = migrations.filter(m => m.version > currentVersion)
  console.log(`[migrations] Versión actual: v${currentVersion}. Aplicando ${pending.length} migración(es)...`)

  for (const migration of pending) {
    console.log(`[migrations] Aplicando v${migration.version}: ${migration.description}`)

    const applyMigration = db.transaction(() => {
      migration.up(db)
      db.prepare('UPDATE schema_version SET version = ?').run(migration.version)
    })

    try {
      applyMigration()
      console.log(`[migrations] v${migration.version} aplicada exitosamente.`)
    } catch (error: any) {
      logger.error(`Migración v${migration.version} falló: ${error.message}`)
      throw new Error(`[migrations] Fallo en v${migration.version}: ${error.message}`)
    }
  }

  console.log(`[migrations] Esquema actualizado a v${REQUIRED_SCHEMA_VERSION}.`)
}

// ─── Database Init ───────────────────────────────────────────────────────────

let db: Database.Database | null = null

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'stock.db')
  db = new Database(dbPath)

  // WAL mode: mejor rendimiento en lecturas concurrentes
  db.pragma('journal_mode = WAL')

  try {
    runMigrations(db)
  } catch (error: any) {
    logger.error(`Error crítico durante migraciones: ${error.message}`)
    console.error(error)
    throw error // Re-throw: the app cannot safely start with a broken schema
  }

  console.log(`[database] Inicializada en: ${dbPath}`)
}

export function getUserByUsername(username: string): any {
  return getDb().prepare('SELECT * FROM User WHERE username = ? AND activo = 1').get(username)
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('[database] No inicializada. Llamar a initDatabase() primero.')
  }
  return db
}

// --- Operaciones CRUD Producto ---

export function listProducts(): Producto[] {
  const stmt = getDb().prepare('SELECT * FROM Producto WHERE activo = 1 ORDER BY createdAt DESC')
  return stmt.all() as Producto[]
}

export function listLowStockProducts(): Producto[] {
  const stmt = getDb().prepare('SELECT * FROM Producto WHERE activo = 1 AND stockActual <= stockMinimo ORDER BY stockActual ASC')
  return stmt.all() as Producto[]
}

export function createProduct(prod: Omit<Producto, 'createdAt'>): void {
  const stmt = getDb().prepare(`
        INSERT INTO Producto (id, nombre, descripcion, stockActual, stockMinimo, activo, createdAt)
        VALUES (@id, @nombre, @descripcion, @stockActual, @stockMinimo, @activo, @createdAt)
    `)
  stmt.run({
    ...prod,
    createdAt: new Date().toISOString()
  })
}

export function updateProduct(id: string, changes: Partial<Omit<Producto, 'id' | 'createdAt'>>): void {
  if (Object.keys(changes).length === 0) return

  const setClause = Object.keys(changes)
    .map(key => `${key} = @${key}`)
    .join(', ')

  const stmt = getDb().prepare(`UPDATE Producto SET ${setClause} WHERE id = @id`)
  stmt.run({ ...changes, id })
}

export function softDeleteProduct(id: string): void {
  const stmt = getDb().prepare('UPDATE Producto SET activo = 0, fecha_eliminacion = ? WHERE id = ?')
  stmt.run(new Date().toISOString(), id)
}

export function listDeletedProducts(): Producto[] {
  const stmt = getDb().prepare('SELECT * FROM Producto WHERE activo = 0 ORDER BY createdAt DESC')
  return stmt.all() as Producto[]
}

export function hardDeleteProduct(id: string): void {
  const checkSales = getDb().prepare('SELECT COUNT(*) as count FROM VentaItem WHERE productoId = ?').get(id) as { count: number }
  if (checkSales.count > 0) {
    throw new Error('El producto está asociado a ventas históricas y no puede ser eliminado definitivamente para no romper los registros.')
  }

  const stmt = getDb().prepare('DELETE FROM Producto WHERE id = ?')
  stmt.run(id)
}

/**
 * Core backup execution using SQLite's backup API.
 */
function executeBackup(prefix: string): string {
  const database = getDb()
  const userDataPath = app.getPath('userData')
  const backupDir = path.join(userDataPath, 'backups')

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const nowNode = new Date()
  const timestamp = nowNode.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '-')
    .split('.')[0]
    .slice(0, -3) // YYYY-MM-DD-HH-mm

  const fileName = `${prefix}${timestamp}.db`
  const backupPath = path.join(backupDir, fileName)

  // Native SQLite backup (non-blocking for other reads)
  database.backup(backupPath)
  return fileName
}

/**
 * Cleanup old backups, keeping only the 7 most recent of a given prefix.
 */
function cleanOldBackups(prefix: string, limit: number = 7) {
  const backupDir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(backupDir)) return

  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
    .sort()

  if (files.length > limit) {
    const toDelete = files.slice(0, files.length - limit)
    toDelete.forEach(f => {
      try {
        fs.unlinkSync(path.join(backupDir, f))
      } catch (e) {
        console.error(`[database] Error borrando backup viejo ${f}:`, e)
      }
    })
  }
}

/**
 * Automated backup logic (every 24h).
 */
export async function manageBackups() {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups')
    const prefix = 'stock-repuestos-'

    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
        .sort()

      if (files.length > 0) {
        const lastFile = files[files.length - 1]
        const filePath = path.join(backupDir, lastFile)
        const stats = fs.statSync(filePath)
        const now = Date.now()
        const diffMs = now - stats.mtimeMs
        const diffHours = diffMs / (1000 * 60 * 60)

        if (diffHours < 24) {
          console.log(`[database] Backup reciente detectado (${diffHours.toFixed(1)}h). Saltando...`)
          return
        }
      }
    }

    const fileName = executeBackup(prefix)
    cleanOldBackups(prefix, 7)
    console.log(`[database] Backup automático generado: ${fileName}`)
  } catch (error) {
    console.error('[database] Error en la rutina de backups:', error)
  }
}

/**
 * Manual backup triggered from UI.
 */
export async function performManualBackup(): Promise<string> {
  const prefix = 'manual-backup-'
  const fileName = executeBackup(prefix)
  cleanOldBackups(prefix, 3) // Keep only 3 manual backups
  return fileName
}

/**
 * List available backups for the UI
 */
export function listAvailableBackups(): BackupFile[] {
  const backupDir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(backupDir)) return []

  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'))
  return files.map(file => {
    const stats = fs.statSync(path.join(backupDir, file))
    return {
      name: file,
      date: stats.mtime.toISOString(),
      size: stats.size
    }
  }).sort((a, b) => b.name.localeCompare(a.name)) // descendente
}

/**
 * Safely restore from a backup file. Requires application restart immediately after.
 */
export function restoreFromBackup(backupFileName: string): void {
  const userDataPath = app.getPath('userData')
  const backupDir = path.join(userDataPath, 'backups')
  const sourcePath = path.join(backupDir, backupFileName)
  const targetPath = path.join(userDataPath, 'stock.db')

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${backupFileName}`)
  }

  // 1. Safety Backup
  try {
    const prefix = 'pre-restore-backup-'
    executeBackup(prefix)
    cleanOldBackups(prefix, 3) // keep up to 3 safety backups
  } catch (err) {
    logger.error(`Error creando backup de seguridad pre-restauración: ${err}`)
    throw new Error('No se pudo crear el backup de seguridad. Restauración cancelada.')
  }

  // 2. Cierre seguro de la DB
  if (db) {
    try {
      db.close()
      db = null
    } catch (err) {
      logger.error(`Error cerrando DB para restauración: ${err}`)
      throw new Error('No se pudo cerrar la base de datos para sobreescritura.')
    }
  }

  // 3. Reemplazo del archivo
  try {
    fs.copyFileSync(sourcePath, targetPath)
    logger.info(`Base de datos restaurada exitosamente desde: ${backupFileName}`)
  } catch (err: any) {
    logger.error(`Error crítico copiando backup: ${err.message}`)
    // Intento de mitigación: reabrir la DB actual si falló la copia
    try {
      initDatabase()
    } catch (_) { }
    throw new Error(`Error copiando archivo de backup: ${err.message}`)
  }
}

// --- Operaciones de Ventas (Transacciones) ---

export function createSale(saleData: CreateSaleData): void {
  const database = getDb()

  // Definición de la transacción atómica
  const executeTransaction = database.transaction((data: CreateSaleData) => {
    // 1. Insertar la Venta
    const insertVenta = database.prepare('INSERT INTO Venta (id, total, fecha) VALUES (?, ?, ?)')
    insertVenta.run(data.id, data.total, new Date().toISOString())

    const insertItem = database.prepare(`
            INSERT INTO VentaItem (id, ventaId, productoId, cantidad, precioUnitario, producto_nombre)
            VALUES (?, ?, ?, ?, ?, ?)
        `)

    const updateStock = database.prepare('UPDATE Producto SET stockActual = stockActual - ? WHERE id = ?')
    const checkStock = database.prepare('SELECT nombre, stockActual FROM Producto WHERE id = ?')

    // 2. Procesar cada item
    for (const item of data.items) {
      // Verificar stock antes de procesar
      const row = checkStock.get(item.productoId) as { nombre: string, stockActual: number } | undefined

      if (!row) {
        throw new Error(`Producto no encontrado: ${item.productoId}`)
      }

      if (row.stockActual < item.cantidad) {
        const errorMsg = `Stock insuficiente para "${row.nombre}". (Disponible: ${row.stockActual}, Solicitado: ${item.cantidad})`
        logger.error(`Venta fallida: ${errorMsg}`)
        throw new Error(errorMsg)
      }

      // Insertar item de venta
      const itemId = `${data.id}_${item.productoId}_${Date.now()}`
      insertItem.run(itemId, data.id, item.productoId, item.cantidad, item.precioUnitario, row.nombre)

      // Actualizar stock
      updateStock.run(item.cantidad, item.productoId)
    }
  })

  // Ejecutar la transacción. Si ocurre un error, better-sqlite3 hace ROLLBACK automáticamente.
  executeTransaction(saleData)
}

export function getSalesDataForExport(startDate: string, endDate: string): any[] {
  // Ajustar fechas para que incluyan todo el día (00:00:00 hasta 23:59:59)
  const start = `${startDate}T00:00:00.000Z`
  const end = `${endDate}T23:59:59.999Z`

  const stmt = getDb().prepare(`
    SELECT 
      v.fecha as fecha_venta,
      vi.producto_nombre,
      vi.cantidad,
      vi.precioUnitario as precio_unitario,
      (vi.cantidad * vi.precioUnitario) as total
    FROM VentaItem vi
    JOIN Venta v ON vi.ventaId = v.id
    WHERE v.fecha BETWEEN ? AND ?
    ORDER BY v.fecha ASC
  `)
  return stmt.all(start, end)
}


