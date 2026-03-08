import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, Producto } from '../shared/types'

const api: ElectronAPI = {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    listProducts: () => ipcRenderer.invoke('app:list-products'),
    listLowStockProducts: () => ipcRenderer.invoke('app:list-low-stock'),
    createProduct: (prod) => ipcRenderer.invoke('app:create-product', prod),
    updateProduct: (id, changes) => ipcRenderer.invoke('app:update-product', id, changes),
    softDeleteProduct: (id) => ipcRenderer.invoke('app:soft-delete', id),
    listDeletedProducts: () => ipcRenderer.invoke('app:list-deleted-products'),
    hardDeleteProduct: (id) => ipcRenderer.invoke('app:hard-delete-product', id),
    createSale: (saleData) => ipcRenderer.invoke('app:create-sale', saleData),
    login: (username, password) => ipcRenderer.invoke('app:login', username, password),
    logout: () => ipcRenderer.invoke('app:logout'),
    getCurrentUser: () => ipcRenderer.invoke('app:get-current-user'),
    generateManualBackup: () => ipcRenderer.invoke('app:generate-backup'),
    listBackups: () => ipcRenderer.invoke('app:list-backups'),
    restoreBackup: (fileName) => ipcRenderer.invoke('app:restore-backup', fileName),
}

contextBridge.exposeInMainWorld('electronAPI', api)
