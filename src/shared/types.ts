/**
 * Shared types used by both main and renderer processes.
 * Import in renderer via window.electronAPI (not directly from Node).
 */

export interface Producto {
    id: string
    nombre: string
    descripcion: string | null
    stockActual: number
    stockMinimo: number
    activo: number // 0 o 1 para SQLite
    createdAt: string
    fecha_eliminacion?: string | null
}

export interface Venta {
    id: string
    total: number
    fecha: string
}

export interface VentaItem {
    id: string
    ventaId: string
    productoId: string
    cantidad: number
    precioUnitario: number
    producto_nombre?: string | null
}

export interface CreateSaleData {
    id: string
    total: number
    items: {
        productoId: string
        cantidad: number
        precioUnitario: number
    }[]
}

export interface User {
    id: number
    username: string
    role: 'admin' | 'vendedor'
}

export interface BackupFile {
    name: string
    date: string
    size: number
}

export interface ElectronAPI {
    getVersion: () => Promise<string>
    listProducts: () => Promise<Producto[]>
    createProduct: (product: Omit<Producto, 'createdAt'>) => Promise<void>
    updateProduct: (id: string, product: Partial<Omit<Producto, 'id' | 'createdAt'>>) => Promise<void>
    softDeleteProduct: (id: string) => Promise<void>
    listDeletedProducts: () => Promise<Producto[]>
    hardDeleteProduct: (id: string) => Promise<void>
    listLowStockProducts: () => Promise<Producto[]>
    createSale: (saleData: CreateSaleData) => Promise<void>

    // Auth
    login: (username: string, password: string) => Promise<User>
    logout: () => Promise<void>
    getCurrentUser: () => Promise<User | null>
    generateManualBackup: () => Promise<string>
    listBackups: () => Promise<BackupFile[]>
    restoreBackup: (fileName: string) => Promise<void>
    exportSalesCSV: (startDate: string, endDate: string) => Promise<{ success: boolean; filePath?: string }>
}

// Augment Window so the renderer gets type-safe access to the exposed API
declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}
