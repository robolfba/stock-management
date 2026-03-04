import React, { useEffect, useState } from 'react'
import type { Producto, User } from '../shared/types'

function App(): React.ReactElement {
    const [version, setVersion] = useState<string>('...')
    const [user, setUser] = useState<User | null>(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)

    // View state
    const [view, setView] = useState<'main' | 'settings'>('main')

    // Backup states
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [backupMessage, setBackupMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

    // Login states
    const [loginUsername, setLoginUsername] = useState('')
    const [loginPassword, setLoginPassword] = useState('')
    const [authError, setAuthError] = useState<string | null>(null)

    // Dashboard states
    const [products, setProducts] = useState<Producto[]>([])
    const [filterLowStock, setFilterLowStock] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    // Form state (Producto)
    const [id, setId] = useState('')
    const [nombre, setNombre] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [stockActual, setStockActual] = useState(0)
    const [stockMinimo, setStockMinimo] = useState(0)
    const [isEditing, setIsEditing] = useState(false)

    // Form state (Venta)
    const [selectedProductId, setSelectedProductId] = useState('')
    const [saleQuantity, setSaleQuantity] = useState(1)

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

    // --- Manejo de Autenticación ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthError(null)
        try {
            const loggedInUser = await window.electronAPI.login(loginUsername, loginPassword)
            setUser(loggedInUser)
        } catch (err: any) {
            setAuthError(err.message || 'Error al iniciar sesión')
        }
    }

    const handleLogout = async () => {
        await window.electronAPI.logout()
        setUser(null)
        setView('main')
        resetForm()
        resetSaleForm()
    }

    // --- Manejo de Formularios ---
    const resetForm = () => {
        setId('')
        setNombre('')
        setDescripcion('')
        setStockActual(0)
        setStockMinimo(0)
        setIsEditing(false)
        setErrorMessage(null)
    }

    const resetSaleForm = () => {
        setSelectedProductId('')
        setSaleQuantity(1)
        setErrorMessage(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)
        setSuccessMessage(null)
        try {
            if (isEditing) {
                await window.electronAPI.updateProduct(id, {
                    nombre,
                    descripcion,
                    stockActual,
                    stockMinimo
                })
            } else {
                await window.electronAPI.createProduct({
                    id: id.trim() || Date.now().toString(),
                    nombre,
                    descripcion,
                    stockActual,
                    stockMinimo,
                    activo: 1
                })
            }
            resetForm()
            loadProducts()
        } catch (err: any) {
            console.error('Error guardando:', err)
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                setErrorMessage(`El ID "${id}" ya está registrado. Ingresá un código distinto.`)
            } else {
                setErrorMessage('Ocurrió un error al guardar el producto. Intentá de nuevo.')
            }
        }
    }

    const handleSaleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)
        setSuccessMessage(null)

        const prod = products.find(p => p.id === selectedProductId)
        if (!prod) return

        try {
            await window.electronAPI.createSale({
                id: `VTA-${Date.now()}`,
                total: prod.stockActual * 10,
                items: [{
                    productoId: selectedProductId,
                    cantidad: saleQuantity,
                    precioUnitario: 10
                }]
            })
            setSuccessMessage(`¡Venta realizada! Se descontaron ${saleQuantity} unidades de ${prod.nombre}.`)
            resetSaleForm()
            loadProducts()
        } catch (err: any) {
            console.error('Error en venta:', err)
            setErrorMessage(err.message || 'Error al procesar la venta.')
        }
    }

    const handleEdit = (p: Producto) => {
        setId(p.id)
        setNombre(p.nombre)
        setDescripcion(p.descripcion || '')
        setStockActual(p.stockActual)
        setStockMinimo(p.stockMinimo)
        setIsEditing(true)
        setErrorMessage(null)
        setSuccessMessage(null)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleDelete = async (deleteId: string) => {
        if (!window.confirm('¿Seguro que querés eliminar este producto?')) return
        try {
            await window.electronAPI.softDeleteProduct(deleteId)
            loadProducts()
        } catch (err: any) {
            console.error('Error eliminando:', err)
            setErrorMessage(err.message || 'Error al eliminar.')
        }
    }

    const handleManualBackup = async () => {
        setIsBackingUp(true)
        setBackupMessage(null)
        try {
            const fileName = await window.electronAPI.generateManualBackup()
            setBackupMessage({ text: `Backup generado con éxito: ${fileName}`, type: 'success' })
        } catch (err: any) {
            setBackupMessage({ text: `Error al generar backup: ${err.message}`, type: 'error' })
        } finally {
            setIsBackingUp(false)
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

    if (isCheckingAuth) {
        return <div style={styles.loginContainer}>Cargando...</div>
    }

    if (!user) {
        return (
            <div style={styles.loginContainer}>
                <div style={styles.loginCard}>
                    <h1 style={{ marginBottom: '10px' }}>📦 Stock Management</h1>
                    <p style={{ color: colors.textMuted, marginBottom: '30px' }}>Iniciá sesión para continuar</p>

                    {authError && <div style={styles.errorBanner}>{authError}</div>}

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
        )
    }

    return (
        <div style={styles.container}>
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

                            {backupMessage && (
                                <div style={{
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '20px',
                                    fontSize: '14px',
                                    backgroundColor: backupMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
                                    color: backupMessage.type === 'success' ? '#065f46' : '#991b1b',
                                    border: `1px solid ${backupMessage.type === 'success' ? '#10b981' : '#f87171'}`
                                }}>
                                    {backupMessage.text}
                                </div>
                            )}

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
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Panel de Venta */}
                        <div style={{ ...styles.card, border: `2px solid ${colors.success}` }}>
                            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: colors.success }}>
                                🛒 Registrar Venta
                            </h2>

                            {successMessage && (
                                <div style={styles.successBanner}>{successMessage}</div>
                            )}
                            {errorMessage && !isEditing && (
                                <div style={styles.errorBanner}>{errorMessage}</div>
                            )}

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
                                        {products.map(p => (
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

                                {errorMessage && isEditing && (
                                    <div style={styles.errorBanner}>{errorMessage}</div>
                                )}

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
