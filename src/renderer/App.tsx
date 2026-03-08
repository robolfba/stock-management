import React, { useEffect, useState } from 'react'
import type { Producto, User, BackupFile } from '../shared/types'

function App(): React.ReactElement {
    const [version, setVersion] = useState<string>('...')
    const [user, setUser] = useState<User | null>(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)

    // View state
    const [view, setView] = useState<'main' | 'settings'>('main')

    type NotificationType = 'success' | 'error' | 'warning' | 'info'
    interface NotificationItem {
        id: number
        text: string
        type: NotificationType
    }
    const [notifications, setNotifications] = useState<NotificationItem[]>([])

    const addNotification = (text: string, type: NotificationType = 'success') => {
        const id = Date.now() + Math.random();

        // Clean up Electron IPC error prefixes
        let cleanText = text;
        if (cleanText.includes('Error invoking remote method')) {
            const parts = cleanText.split('Error: ');
            if (parts.length > 1) {
                // Return everything after the first "Error: "
                cleanText = parts.slice(1).join('Error: ');
            }
        }

        setNotifications(prev => [...prev, { id, text: cleanText, type }]);

        // Auto-dismiss for all messages
        setTimeout(() => {
            removeNotification(id);
        }, 5000);
    }

    const removeNotification = (id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }

    // Backup states
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [isRestoring, setIsRestoring] = useState(false)
    const [backupsList, setBackupsList] = useState<BackupFile[]>([])

    // Export states
    const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0])
    const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0])
    const [isExporting, setIsExporting] = useState(false)

    // Login states
    const [loginUsername, setLoginUsername] = useState('')
    const [loginPassword, setLoginPassword] = useState('')

    // Dashboard states
    const [products, setProducts] = useState<Producto[]>([])
    const [deletedProducts, setDeletedProducts] = useState<Producto[]>([])
    const [filterLowStock, setFilterLowStock] = useState(false)

    // Form state (Producto)
    const [id, setId] = useState('')
    const [nombre, setNombre] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [stockActual, setStockActual] = useState<number | ''>('')
    const [stockMinimo, setStockMinimo] = useState<number | ''>('')
    const [isEditing, setIsEditing] = useState(false)

    // Form state (Venta)
    const [selectedProductId, setSelectedProductId] = useState('')
    const [saleQuantity, setSaleQuantity] = useState<number | ''>('')

    // --- Efectos Iniciales ---
    useEffect(() => {
        window.electronAPI.getVersion().then(setVersion).catch(console.error)

        // Verificar sesión activa al arrancar
        window.electronAPI.getCurrentUser().then(u => {
            setUser(u)
            setIsCheckingAuth(false)
        }).catch(() => setIsCheckingAuth(false))
    }, [])

    useEffect(() => {
        if (user) {
            loadProducts()
        }
    }, [user, filterLowStock])

    const loadProducts = async () => {
        try {
            const data = filterLowStock
                ? await window.electronAPI.listLowStockProducts()
                : await window.electronAPI.listProducts()
            setProducts(data)
        } catch (err) {
            console.error('Error cargando productos:', err)
        }
    }

    useEffect(() => {
        if (view === 'settings' && user?.role === 'admin') {
            loadBackups()
            loadDeletedProducts()
        }
    }, [view, user])

    const loadDeletedProducts = async () => {
        try {
            const data = await window.electronAPI.listDeletedProducts()
            setDeletedProducts(data)
        } catch (err: any) {
            addNotification(err.message, 'error')
        }
    }

    const handleHardDelete = async (id: string) => {
        const confirm = window.confirm('Esta acción borrará el ID permitiendo reutilizarlo, pero perderá su información básica.\n\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE este producto?')
        if (!confirm) return

        try {
            await window.electronAPI.hardDeleteProduct(id)
            addNotification('Producto eliminado definitivamente de la base de datos.', 'success')
            loadDeletedProducts()
        } catch (err: any) {
            addNotification(err.message, 'error')
        }
    }

    const loadBackups = async () => {
        try {
            const list = await window.electronAPI.listBackups()
            setBackupsList(list)
        } catch (err: any) {
            console.error('Error loading backups:', err)
        }
    }

    const handleExportSales = async () => {
        if (!exportStartDate || !exportEndDate) {
            addNotification('Por favor, seleccioná un rango de fechas válido.', 'warning')
            return
        }

        setIsExporting(true)
        try {
            const result = await window.electronAPI.exportSalesCSV(exportStartDate, exportEndDate)
            if (result.success) {
                addNotification(`Ventas exportadas exitosamente en: ${result.filePath}`, 'success')
            }
        } catch (err: any) {
            addNotification(err.message || 'Error al exportar ventas', 'error')
        } finally {
            setIsExporting(false)
        }
    }

    // --- Manejo de Autenticación ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const loggedInUser = await window.electronAPI.login(loginUsername, loginPassword)
            setUser(loggedInUser)
        } catch (err: any) {
            addNotification(err.message || 'Error al iniciar sesión', 'error')
        }
    }

    const handleLogout = async () => {
        await window.electronAPI.logout()
        setUser(null)
        setView('main')
        resetForm()
        resetSaleForm()
        setLoginUsername('')
        setLoginPassword('')
    }

    // --- Manejo de Formularios ---
    const resetForm = () => {
        setId('')
        setNombre('')
        setDescripcion('')
        setStockActual('')
        setStockMinimo('')
        setIsEditing(false)
    }

    const resetSaleForm = () => {
        setSelectedProductId('')
        setSaleQuantity('')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (stockActual === '' || stockActual < 0 || stockMinimo === '' || stockMinimo < 0) {
            addNotification('El stock debe ser un número igual o mayor a cero.', 'error')
            return
        }

        try {
            if (isEditing) {
                await window.electronAPI.updateProduct(id, {
                    nombre,
                    descripcion,
                    stockActual: Number(stockActual),
                    stockMinimo: Number(stockMinimo)
                })
                addNotification('Producto editado con éxito', 'success')
            } else {
                await window.electronAPI.createProduct({
                    id: id.trim() || Date.now().toString(),
                    nombre,
                    descripcion,
                    stockActual: Number(stockActual),
                    stockMinimo: Number(stockMinimo),
                    activo: 1
                })
                addNotification('Producto registrado con éxito', 'success')
            }
            resetForm()
            loadProducts()
        } catch (err: any) {
            console.error('Error guardando:', err)
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                addNotification(`El ID "${id}" ya está registrado. Ingresá un código distinto.`, 'error')
            } else {
                addNotification('Ocurrió un error al guardar el producto. Intentá de nuevo.', 'error')
            }
        }
    }

    const handleSaleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (saleQuantity === '' || Number(saleQuantity) <= 0) {
            addNotification('La cantidad de venta debe ser mayor a cero.', 'error')
            return
        }

        const prod = products.find(p => p.id === selectedProductId)
        if (!prod) {
            addNotification('Por favor, seleccioná un producto válido.', 'error')
            return
        }

        if (Number(saleQuantity) > prod.stockActual) {
            addNotification(`Stock insuficiente. Solo hay ${prod.stockActual} unidades.`, 'error')
            return
        }

        try {
            await window.electronAPI.createSale({
                id: `VTA-${Date.now()}`,
                total: prod.stockActual * 10,
                items: [{
                    productoId: selectedProductId,
                    cantidad: Number(saleQuantity),
                    precioUnitario: 10
                }]
            })
            addNotification(`¡Venta realizada! Se descontaron ${saleQuantity} unidades de ${prod.nombre}.`, 'success')
            resetSaleForm()
            loadProducts()
        } catch (err: any) {
            console.error('Error en venta:', err)
            addNotification(err.message || 'Error al procesar la venta.', 'error')
        }
    }

    const handleEdit = (p: Producto) => {
        setId(p.id)
        setNombre(p.nombre)
        setDescripcion(p.descripcion || '')
        setStockActual(p.stockActual)
        setStockMinimo(p.stockMinimo)
        setIsEditing(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleDelete = async (deleteId: string) => {
        if (!window.confirm('¿Seguro que querés eliminar este producto?')) return
        try {
            await window.electronAPI.softDeleteProduct(deleteId)
            addNotification('Producto eliminado.', 'success')
            loadProducts()
        } catch (err: any) {
            console.error('Error eliminando:', err)
            addNotification(err.message || 'Error al eliminar.', 'error')
        }
    }

    const handleManualBackup = async () => {
        setIsBackingUp(true)
        try {
            const fileName = await window.electronAPI.generateManualBackup()
            addNotification(`Backup generado con éxito: ${fileName}`, 'success')
            loadBackups()
        } catch (err: any) {
            addNotification(`Error al generar backup: ${err.message}`, 'error')
        } finally {
            setIsBackingUp(false)
        }
    }

    const handleRestoreBackup = async (fileName: string) => {
        if (!window.confirm(`¿Restaurar desde ${fileName}?\n\nPerderás todos los cambios realizados desde que se creó este backup.`)) {
            return
        }
        if (!window.confirm('⚠️ ESTA ACCIÓN ES IRREVERSIBLE ⚠️\n\nSe generará un backup automático de seguridad antes de proceder.\nLa aplicación se reiniciará inmediatamente después.\n\n¿Estás absolutamente seguro de continuar?')) {
            return
        }

        setIsRestoring(true)
        addNotification('Restaurando base de datos... La app se reiniciará en unos instantes.', 'info')
        try {
            await window.electronAPI.restoreBackup(fileName)
            // No se quita el isRestoring porque la app se reinicia sola en este punto
        } catch (err: any) {
            addNotification(`Error al restaurar: ${err.message}`, 'error')
            setIsRestoring(false)
        }
    }

    // --- Estilos ---
    const colors = {
        primary: '#2563eb',
        primaryHover: '#1d4ed8',
        danger: '#ef4444',
        dangerHover: '#dc2626',
        success: '#10b981',
        bg: '#f3f4f6',
        cardBb: '#ffffff',
        textMain: '#1f2937',
        textMuted: '#6b7280',
        border: '#e5e7eb',
        lowStockBg: '#fef2f2',
        lowStockText: '#b91c1c'
    }

    const styles = {
        container: {
            minHeight: '100vh',
            backgroundColor: colors.bg,
            color: colors.textMain,
            fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            padding: '40px 20px',
        },
        loginContainer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: colors.bg
        },
        loginCard: {
            backgroundColor: '#fff',
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            width: '100%',
            maxWidth: '400px',
            textAlign: 'center' as const
        },
        header: {
            maxWidth: '1000px',
            margin: '0 auto 30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        title: {
            margin: 0,
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#111827'
        },
        badge: {
            backgroundColor: '#e0e7ff',
            color: '#4338ca',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold'
        },
        card: {
            backgroundColor: colors.cardBb,
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '24px',
            maxWidth: '1000px',
            margin: '0 auto 30px',
        },
        formGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
        },
        inputGroup: {
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '8px'
        },
        label: {
            fontSize: '14px',
            fontWeight: '600',
            color: colors.textMain
        },
        input: {
            padding: '10px 12px',
            borderRadius: '6px',
            border: `1px solid ${colors.border}`,
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s',
        },
        btnPrimary: {
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
        },
        btnSecondary: {
            backgroundColor: '#f3f4f6',
            color: colors.textMain,
            border: `1px solid ${colors.border}`,
            padding: '10px 16px',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
        },
        btnSuccess: {
            backgroundColor: colors.success,
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
        },
        btnDanger: {
            backgroundColor: 'transparent',
            color: colors.danger,
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '13px'
        },
        btnEdit: {
            backgroundColor: '#f3f4f6',
            color: colors.textMain,
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '13px',
            marginRight: '8px'
        },
        btnLogout: {
            backgroundColor: colors.danger,
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '13px'
        },
        errorBanner: {
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontWeight: '500',
            fontSize: '14px',
            borderLeft: '4px solid #ef4444'
        },
        successBanner: {
            backgroundColor: '#ecfdf5',
            color: '#065f46',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontWeight: '500',
            fontSize: '14px',
            borderLeft: '4px solid #10b981'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse' as const,
            marginTop: '10px'
        },
        th: {
            textAlign: 'left' as const,
            padding: '12px',
            borderBottom: `2px solid ${colors.border}`,
            color: colors.textMuted,
            fontWeight: '600',
            fontSize: '13px',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em'
        },
        td: {
            padding: '16px 12px',
            borderBottom: `1px solid ${colors.border}`,
            fontSize: '14px',
            color: colors.textMain,
            verticalAlign: 'middle' as const
        },
        statusWarning: {
            backgroundColor: colors.lowStockBg,
            color: colors.lowStockText,
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'inline-block',
            marginTop: '4px'
        },
        stockNormal: {
            color: '#059669',
            fontWeight: '600'
        },
        filterRow: {
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '15px'
        }
    }

    const notificationsJSX = (
        <>
            {/* Global Styles for Number Inputs */}
            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>

            {/* Notifications Container */}
            <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {notifications.map(n => {
                    const typeColors = {
                        success: { bg: '#ecfdf5', text: '#065f46', border: '#10b981' },
                        error: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
                        warning: { bg: '#fffbeb', text: '#b45309', border: '#f59e0b' },
                        info: { bg: '#eff6ff', text: '#1d4ed8', border: '#3b82f6' }
                    }
                    const c = typeColors[n.type]
                    return (
                        <div key={n.id} style={{
                            backgroundColor: c.bg,
                            color: c.text,
                            borderLeft: `4px solid ${c.border}`,
                            padding: '12px 16px',
                            borderRadius: '6px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minWidth: '300px',
                            maxWidth: '400px'
                        }}>
                            <span style={{ fontSize: '14px', fontWeight: '500', marginRight: '16px' }}>{n.text}</span>
                            <button
                                onClick={() => removeNotification(n.id)}
                                style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: c.text, padding: '4px' }}
                            >✕</button>
                        </div>
                    )
                })}
            </div>
        </>
    )

    if (isCheckingAuth) {
        return (
            <>
                {notificationsJSX}
                <div style={styles.loginContainer}>Cargando...</div>
            </>
        )
    }

    if (!user) {
        return (
            <>
                {notificationsJSX}
                <div style={styles.loginContainer}>
                    <div style={styles.loginCard}>
                        <h1 style={{ marginBottom: '10px' }}>📦 Stock Management</h1>
                        <p style={{ color: colors.textMuted, marginBottom: '30px' }}>Iniciá sesión para continuar</p>

                        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Usuario</label>
                                <input
                                    style={styles.input}
                                    required
                                    value={loginUsername}
                                    onChange={e => setLoginUsername(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Contraseña</label>
                                <input
                                    type="password"
                                    style={styles.input}
                                    required
                                    value={loginPassword}
                                    onChange={e => setLoginPassword(e.target.value)}
                                />
                            </div>
                            <button type="submit" style={{ ...styles.btnPrimary, height: '45px', marginTop: '10px' }}>Entrar</button>
                        </form>
                    </div>
                </div>
            </>
        )
    }

    return (
        <div style={styles.container}>
            {notificationsJSX}


            <header style={styles.header}>
                <div>
                    <h1 style={styles.title}>📦 Stock Management</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={styles.badge}>v{version}</span>
                        <span style={{ fontSize: '13px', color: colors.textMuted }}>
                            Hola, <strong>{user.username}</strong> ({user.role})
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {user.role === 'admin' && (
                        <button
                            onClick={() => setView(view === 'main' ? 'settings' : 'main')}
                            style={{
                                ...styles.btnSecondary,
                                backgroundColor: view === 'settings' ? colors.primary : '#f3f4f6',
                                color: view === 'settings' ? '#fff' : colors.textMain
                            }}
                        >
                            {view === 'main' ? '⚙️ Configuración' : '🏠 Volver'}
                        </button>
                    )}
                    <button onClick={handleLogout} style={styles.btnLogout}>Cerrar Sesión</button>
                </div>
            </header>

            <main>
                {view === 'settings' ? (
                    <div style={styles.card}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>⚙️ Configuración del Sistema</h2>
                        <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Copias de Seguridad (Backups)</h3>
                            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                                Generá una copia de seguridad manual de la base de datos en cualquier momento.
                                El sistema guarda automáticamente una copia cada 24 horas.
                            </p>

                            <button
                                onClick={handleManualBackup}
                                disabled={isBackingUp}
                                style={{
                                    ...styles.btnPrimary,
                                    backgroundColor: isBackingUp ? '#9ca3af' : colors.primary,
                                    width: 'auto',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isBackingUp ? '⌛ Generando backup...' : '📦 Generar backup ahora'}
                            </button>

                            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '30px 0' }} />
                            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Restaurar Copia de Seguridad</h3>
                            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                                Seleccioná un archivo para restaurar la base de datos a ese estado exacto. Se creará una copia de seguridad temporal por protección.
                            </p>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Archivo</th>
                                            <th style={styles.th}>Fecha</th>
                                            <th style={styles.th}>Tamaño</th>
                                            <th style={styles.th}>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {backupsList.map(b => (
                                            <tr key={b.name} style={{ backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
                                                <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '13px' }}>{b.name}</td>
                                                <td style={{ ...styles.td, fontSize: '13px' }}>{new Date(b.date).toLocaleString()}</td>
                                                <td style={{ ...styles.td, fontSize: '13px' }}>{(b.size / 1024).toFixed(1)} KB</td>
                                                <td style={styles.td}>
                                                    <button
                                                        onClick={() => handleRestoreBackup(b.name)}
                                                        disabled={isRestoring || isBackingUp}
                                                        style={{ ...styles.btnSecondary, color: colors.danger, backgroundColor: '#fff', padding: '6px 12px', fontSize: '12px' }}
                                                    >
                                                        Restaurar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {backupsList.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay backups disponibles</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '30px 0' }} />
                            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Reportes y Exportación</h3>
                            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                                Exportá el historial de ventas en formato CSV compatible con Excel. Seleccioná el rango de fechas deseado.
                            </p>

                            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', marginBottom: '10px' }}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Desde</label>
                                    <input
                                        type="date"
                                        style={{ ...styles.input, width: '160px' }}
                                        value={exportStartDate}
                                        onChange={e => setExportStartDate(e.target.value)}
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Hasta</label>
                                    <input
                                        type="date"
                                        style={{ ...styles.input, width: '160px' }}
                                        value={exportEndDate}
                                        onChange={e => setExportEndDate(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleExportSales}
                                    disabled={isExporting}
                                    style={{
                                        ...styles.btnSuccess,
                                        width: 'auto',
                                        height: '40px',
                                        backgroundColor: isExporting ? '#9ca3af' : colors.success,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {isExporting ? '⌛ Generando...' : '📊 Exportar Ventas a CSV'}
                                </button>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '30px 0' }} />
                            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Productos Eliminados</h3>
                            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                                Listado de productos marcados como inactivos (soft-delete). Podés eliminarlos definitivamente (hard-delete) si no poseen registros de ventas históricos.
                            </p>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>ID</th>
                                            <th style={styles.th}>Nombre</th>
                                            <th style={styles.th}>Descripción</th>
                                            <th style={styles.th}>Stock</th>
                                            <th style={styles.th}>Mínimo</th>
                                            <th style={styles.th}>Fecha Eliminación</th>
                                            <th style={styles.th}>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deletedProducts.map(p => (
                                            <tr key={p.id} style={{ backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
                                                <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '13px' }}>{p.id}</td>
                                                <td style={styles.td}>{p.nombre}</td>
                                                <td style={styles.td}>{p.descripcion || '-'}</td>
                                                <td style={styles.td}>{p.stockActual}</td>
                                                <td style={styles.td}>{p.stockMinimo}</td>
                                                <td style={styles.td}>{p.fecha_eliminacion ? new Date(p.fecha_eliminacion).toLocaleString() : '-'}</td>
                                                <td style={styles.td}>
                                                    <button
                                                        onClick={() => handleHardDelete(p.id)}
                                                        style={{ ...styles.btnSecondary, color: '#991b1b', backgroundColor: '#fee2e2', padding: '6px 12px', fontSize: '12px', border: 'none' }}
                                                    >
                                                        Eliminar Definitivamente
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {deletedProducts.length === 0 && (
                                            <tr>
                                                <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay productos eliminados</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    </div>
                ) : (
                    <>
                        {/* Panel de Venta */}
                        <div style={{ ...styles.card, border: `2px solid ${colors.success}` }}>
                            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: colors.success }}>
                                🛒 Registrar Venta
                            </h2>

                            <form onSubmit={handleSaleSubmit} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Producto</label>
                                    <select
                                        required
                                        style={{ ...styles.input, width: '250px' }}
                                        value={selectedProductId}
                                        onChange={e => setSelectedProductId(e.target.value)}
                                    >
                                        <option value="">Seleccionar producto...</option>
                                        {products.filter(p => p.activo === 1 && p.stockActual > 0).map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre} (ID: {p.id})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>Cantidad</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        style={{ ...styles.input, width: '100px' }}
                                        value={saleQuantity}
                                        onChange={e => setSaleQuantity(Number(e.target.value))}
                                    />
                                </div>
                                <button type="submit" style={styles.btnSuccess}>Confirmar Venta</button>
                            </form>
                        </div>

                        {/* Panel del Formulario de Producto (Solo Admin) */}
                        {user.role === 'admin' && (
                            <div style={styles.card}>
                                <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isEditing ? '✏️ Editar Producto' : '✨ Nuevo Producto'}
                                </h2>

                                <form onSubmit={handleSubmit}>
                                    <div style={styles.formGrid}>
                                        <div style={styles.inputGroup}>
                                            <label style={styles.label}>ID (Código)</label>
                                            <input
                                                style={{ ...styles.input, backgroundColor: isEditing ? '#f3f4f6' : '#fff' }}
                                                required
                                                disabled={isEditing}
                                                value={id}
                                                onChange={e => setId(e.target.value)}
                                                placeholder="Ej: PRD-001"
                                            />
                                        </div>
                                        <div style={styles.inputGroup}>
                                            <label style={styles.label}>Nombre</label>
                                            <input
                                                style={styles.input}
                                                required
                                                value={nombre}
                                                onChange={e => setNombre(e.target.value)}
                                                placeholder="Ej: Teclado Mecánico"
                                            />
                                        </div>
                                        <div style={styles.inputGroup}>
                                            <label style={styles.label}>Descripción</label>
                                            <input
                                                style={styles.input}
                                                value={descripcion}
                                                onChange={e => setDescripcion(e.target.value)}
                                                placeholder="Opcional..."
                                            />
                                        </div>
                                        <div style={styles.inputGroup}>
                                            <label style={styles.label}>Stock Actual</label>
                                            <input
                                                style={styles.input}
                                                type="number"
                                                min="0"
                                                required
                                                value={stockActual}
                                                onChange={e => setStockActual(Number(e.target.value))}
                                            />
                                        </div>
                                        <div style={styles.inputGroup}>
                                            <label style={styles.label}>Stock Mínimo</label>
                                            <input
                                                style={styles.input}
                                                type="number"
                                                min="0"
                                                required
                                                value={stockMinimo}
                                                onChange={e => setStockMinimo(Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button type="submit" style={styles.btnPrimary}>
                                            {isEditing ? 'Guardar Cambios' : 'Registrar Producto'}
                                        </button>
                                        {isEditing && (
                                            <button type="button" onClick={resetForm} style={styles.btnSecondary}>
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>
                        )}

                        <div style={styles.card}>
                            <div style={styles.filterRow}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', ...styles.label }}>
                                    <input
                                        type="checkbox"
                                        checked={filterLowStock}
                                        onChange={e => setFilterLowStock(e.target.checked)}
                                        style={{ width: '16px', height: '16px', accentColor: colors.primary }}
                                    />
                                    Mostrar solo stock crítico
                                </label>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Código</th>
                                            <th style={styles.th}>Producto</th>
                                            <th style={styles.th}>Disponibilidad</th>
                                            <th style={styles.th}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map(p => {
                                            const isLowStock = p.stockActual <= p.stockMinimo

                                            return (
                                                <tr key={p.id} style={{
                                                    backgroundColor: isLowStock ? colors.lowStockBg : '#fff',
                                                    transition: 'background-color 0.2s'
                                                }}>
                                                    <td style={styles.td}><strong>{p.id}</strong></td>
                                                    <td style={styles.td}>
                                                        <div style={{ fontWeight: '500' }}>{p.nombre}</div>
                                                        {p.descripcion && <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>{p.descripcion}</div>}
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{ fontSize: '16px' }}>
                                                            <span style={isLowStock ? { color: colors.lowStockText, fontWeight: 'bold' } : styles.stockNormal}>
                                                                {p.stockActual}
                                                            </span>
                                                            <span style={{ color: colors.textMuted, fontSize: '13px' }}> / min {p.stockMinimo}</span>
                                                        </div>
                                                        {isLowStock && <div style={styles.statusWarning}>⚠️ Reponer stock</div>}
                                                    </td>
                                                    <td style={styles.td}>
                                                        {user.role === 'admin' && (
                                                            <button onClick={() => handleEdit(p)} style={styles.btnEdit}>Editar</button>
                                                        )}
                                                        {user.role === 'admin' && (
                                                            <button onClick={() => handleDelete(p.id)} style={styles.btnDanger}>Eliminar</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {products.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: colors.textMuted }}>
                                                    No se encontraron productos. {filterLowStock ? '¡Excelente, no hay stock crítico!' : ''}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}

export default App
