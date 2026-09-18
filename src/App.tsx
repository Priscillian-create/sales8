import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Filter,
  LogOut,
  PackageCheck,
  Pill,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Syringe,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { isSupabaseConfigured, supabase } from './supabase'
import './App.css'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Medicine = {
  id: number
  name: string
  generic: string
  category: string
  batch: string
  stock: number
  reorder: number
  expiry: string
  price: number
  prescription: boolean
  location: string
  supplier: string
}

type Customer = {
  id: number
  name: string
  phone: string
  plan: string
  allergies: string
  last: string
  status: string
}

type RxStatus = 'Insurance' | 'Clinical check' | 'Verified' | 'Filled' | 'Released'

type Prescription = {
  id: string
  patientId: number
  medicationId: number
  status: RxStatus
  prescriber: string
  wait: string
}

type CartLine = Medicine & {
  qty: number
}

type Sale = {
  id: string
  patient: string
  cashier: string
  payment: string
  shift: string
  subtotal: number
  discount: number
  total: number
  items: CartLine[]
  createdAt: string
}

type MedicineForm = {
  name: string
  generic: string
  category: string
  batch: string
  stock: string
  reorder: string
  expiry: string
  price: string
  prescription: boolean
  location: string
  supplier: string
}

type CustomerForm = {
  name: string
  phone: string
  plan: string
  allergies: string
}

type LoginForm = {
  name: string
  password: string
}

type ProductRow = Medicine

type CustomerRow = Customer

type PrescriptionRow = {
  id: string
  patient_id: number
  medication_id: number
  status: RxStatus
  prescriber: string
  wait: string
}

type SaleRow = {
  id: string
  patient: string
  cashier: string
  payment: string
  shift: string
  subtotal: number
  discount: number
  total: number
  items: CartLine[]
  created_at: string
}

type ProfileRow = {
  email: string
  name: string | null
  role: string | null
}

const initialInventory: Medicine[] = []

const initialCustomers: Customer[] = [
  { id: 1, name: 'Grace Miller', phone: '(555) 018-4491', plan: 'Aetna Rx', allergies: 'Penicillin', last: 'New customer profile', status: 'Due today' },
  { id: 2, name: 'Daniel Brooks', phone: '(555) 013-9240', plan: 'Private pay', allergies: 'None recorded', last: 'Blood pressure check', status: 'Ready' },
  { id: 3, name: 'Maya Chen', phone: '(555) 019-3044', plan: 'BlueCross', allergies: 'Sulfa', last: 'New customer profile', status: 'Needs consult' },
]

const initialPrescriptions: Prescription[] = []

const initialSales: Sale[] = []

const navItems = [
  { label: 'Register', icon: ShoppingCart },
  { label: 'Prescriptions', icon: ClipboardList },
  { label: 'Inventory', icon: PackageCheck },
  { label: 'Customers', icon: UsersRound },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Settings', icon: Settings },
] as const

type TabLabel = (typeof navItems)[number]['label']

const moduleCopy: Record<TabLabel, { eyebrow: string; title: string }> = {
  Register: { eyebrow: 'Today, live pharmacy counter', title: 'Point of Sale' },
  Prescriptions: { eyebrow: 'Clinical workflow', title: 'Prescriptions' },
  Inventory: { eyebrow: 'Stock control', title: 'Inventory' },
  Customers: { eyebrow: 'Patient care', title: 'Customers' },
  Reports: { eyebrow: 'Business intelligence', title: 'Reports' },
  Settings: { eyebrow: 'System configuration', title: 'Settings' },
}

const emptyMedicineForm: MedicineForm = {
  name: '',
  generic: '',
  category: '',
  batch: '',
  stock: '',
  reorder: '',
  expiry: '',
  price: '',
  prescription: false,
  location: '',
  supplier: '',
}

const emptyCustomerForm: CustomerForm = {
  name: '',
  phone: '',
  plan: '',
  allergies: '',
}

const emptyLoginForm: LoginForm = {
  name: '',
  password: '',
}

const statusFlow: Record<RxStatus, RxStatus> = {
  Insurance: 'Clinical check',
  'Clinical check': 'Verified',
  Verified: 'Filled',
  Filled: 'Released',
  Released: 'Released',
}

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

const cashierDisplayName = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed.includes('@')) return trimmed

  const fromEmail = trimmed.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return fromEmail || trimmed
}

const normalizeRole = (value?: string | null) => {
  const role = value?.trim().toLowerCase()

  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'pharmacist') return 'Pharmacist'
  return 'Cashier'
}

const writeStored = <T,>(key: string, value: T) => {
  window.localStorage.setItem(key, JSON.stringify(value))
}

const pendingSyncKey = 'purela.pendingSyncTables'
const pendingDeleteKey = 'purela.pendingDeletes'

const markPendingSync = (table: string) => {
  const pending = new Set(readStored<string[]>(pendingSyncKey, []))
  pending.add(table)
  writeStored(pendingSyncKey, Array.from(pending))
}

const clearPendingSync = (table: string) => {
  const pending = readStored<string[]>(pendingSyncKey, []).filter((item) => item !== table)
  writeStored(pendingSyncKey, pending)
}

const markPendingDelete = (table: string, id: number | string) => {
  const pending = readStored<Record<string, Array<number | string>>>(pendingDeleteKey, {})
  const tableDeletes = new Set(pending[table] ?? [])
  tableDeletes.add(id)
  writeStored(pendingDeleteKey, { ...pending, [table]: Array.from(tableDeletes) })
  markPendingSync(table)
}

const clearPendingDelete = (table: string, id: number | string) => {
  const pending = readStored<Record<string, Array<number | string>>>(pendingDeleteKey, {})
  const tableDeletes = (pending[table] ?? []).filter((item) => item !== id)
  writeStored(pendingDeleteKey, { ...pending, [table]: tableDeletes })
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value)

const nextOfflineSafeId = () => Date.now() + Math.floor(Math.random() * 1000)

const generateBatchNumber = () => {
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PUR-${new Date().getFullYear()}-${randomPart}`
}

const getCurrentShift = () => {
  const hour = new Date().getHours()
  if (hour >= 7 && hour < 15) return 'Morning Shift'
  if (hour >= 15 && hour < 23) return 'Afternoon Shift'
  return 'Off Shift'
}

const prescriptionToRow = (rx: Prescription): PrescriptionRow => ({
  id: rx.id,
  patient_id: rx.patientId,
  medication_id: rx.medicationId,
  status: rx.status,
  prescriber: rx.prescriber,
  wait: rx.wait,
})

const rowToPrescription = (row: PrescriptionRow): Prescription => ({
  id: row.id,
  patientId: row.patient_id,
  medicationId: row.medication_id,
  status: row.status,
  prescriber: row.prescriber,
  wait: row.wait,
})

const saleToRow = (sale: Sale): SaleRow => ({
  id: sale.id,
  patient: sale.patient,
  cashier: sale.cashier,
  payment: sale.payment,
  shift: sale.shift,
  subtotal: sale.subtotal,
  discount: sale.discount,
  total: sale.total,
  items: sale.items,
  created_at: sale.createdAt,
})

const rowToSale = (row: SaleRow): Sale => ({
  id: row.id,
  patient: row.patient,
  cashier: row.cashier,
  payment: row.payment,
  shift: row.shift,
  subtotal: Number(row.subtotal),
  discount: Number(row.discount),
  total: Number(row.total),
  items: row.items,
  createdAt: row.created_at,
})

const mergeByKey = <T,>(
  remoteRows: T[],
  localRows: T[],
  getKey: (row: T) => string,
  pendingDeletes: Array<number | string> = [],
  localWins = true,
) => {
  const deleted = new Set(pendingDeletes.map(String))
  const merged = new Map<string, T>()

  remoteRows.forEach((row) => {
    if (!deleted.has(getKey(row))) {
      merged.set(getKey(row), row)
    }
  })

  localRows.forEach((row) => {
    if (!deleted.has(getKey(row))) {
      if (localWins || !merged.has(getKey(row))) {
        merged.set(getKey(row), row)
      }
    }
  })

  return Array.from(merged.values())
}

const mergeProducts = (remoteProducts: Medicine[], localProducts: Medicine[], pendingDeletes: Array<number | string> = [], localWins = true) => {
  const deleted = new Set(pendingDeletes.map(String))
  const activeRemote = remoteProducts.filter((product) => !deleted.has(String(product.id)) && !deleted.has(product.batch))
  const activeLocal = localProducts.filter((product) => !deleted.has(String(product.id)) && !deleted.has(product.batch))

  return mergeByKey(activeRemote, activeLocal, (product) => product.batch || String(product.id), [], localWins).sort((a, b) => a.name.localeCompare(b.name))
}

const mergeCustomers = (remoteCustomers: Customer[], localCustomers: Customer[], localWins = true) =>
  mergeByKey(remoteCustomers, localCustomers, (customer) => String(customer.id), [], localWins).sort((a, b) => a.name.localeCompare(b.name))

const mergePrescriptions = (remotePrescriptions: Prescription[], localPrescriptions: Prescription[], localWins = true) =>
  mergeByKey(remotePrescriptions, localPrescriptions, (prescription) => prescription.id, [], localWins)

const mergeSales = (remoteSales: Sale[], localSales: Sale[], localWins = true) =>
  mergeByKey(remoteSales, localSales, (sale) => sale.id, [], localWins).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

const syncSupabase = async <T extends { id: number | string }>(table: string, rows: T[]) => {
  if (rows.length === 0) return null
  if (!supabase || !navigator.onLine) {
    markPendingSync(table)
    return null
  }

  try {
    const result = await supabase.from(table).upsert(rows, { onConflict: 'id' })
    if (result.error) {
      markPendingSync(table)
    } else {
      clearPendingSync(table)
    }
    return result
  } catch {
    markPendingSync(table)
    return null
  }
}

const clearSupabaseTable = async (table: string, textId = false) => {
  if (!supabase) return null
  return supabase.from(table).delete().neq('id', textId ? '' : -1)
}

const flushPendingSupabaseData = async () => {
  const client = supabase
  if (!client || !navigator.onLine) return

  const pending = readStored<string[]>(pendingSyncKey, [])
  if (pending.length === 0) return
  const pendingDeletes = readStored<Record<string, Array<number | string>>>(pendingDeleteKey, {})

  const tasks: Record<string, () => Promise<unknown>> = {
    products: () => syncSupabase('products', readStored<Medicine[]>('purela.clean.inventory', initialInventory)),
    customers: () => syncSupabase('customers', readStored<Customer[]>('purela.customers', initialCustomers)),
    prescriptions: () =>
      syncSupabase(
        'prescriptions',
        readStored<Prescription[]>('purela.clean.prescriptions', initialPrescriptions).map(prescriptionToRow),
      ),
    sales: () => syncSupabase('sales', readStored<Sale[]>('purela.clean.sales', initialSales).map(saleToRow)),
  }

  await Promise.all(
    pending.map(async (table) => {
      await tasks[table]?.()

      if (pendingDeletes[table]?.length) {
        await Promise.all(
          pendingDeletes[table].map(async (id) => {
            const result = await client.from(table).delete().eq('id', id)
            if (!result.error) {
              clearPendingDelete(table, id)
            } else {
              markPendingSync(table)
            }
          }),
        )
      }
    }),
  )
}

function App() {
  const [inventory, setInventory] = useState<Medicine[]>(() => readStored('purela.clean.inventory', initialInventory))
  const [customers, setCustomers] = useState<Customer[]>(() => readStored('purela.customers', initialCustomers))
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => readStored('purela.clean.prescriptions', initialPrescriptions))
  const [sales, setSales] = useState<Sale[]>(() => readStored('purela.clean.sales', initialSales))
  const [cart, setCart] = useState<CartLine[]>([])
  const [activeTab, setActiveTab] = useState<TabLabel>('Register')
  const [query, setQuery] = useState('')
  const [inventoryQuery, setInventoryQuery] = useState('')
  const [payment, setPayment] = useState('Cash')
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | 'walk-in'>('walk-in')
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null)
  const [toast, setToast] = useState('Ready for sale')
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [fieldPopup, setFieldPopup] = useState<string[]>([])
  const [medicineForm, setMedicineForm] = useState<MedicineForm>(emptyMedicineForm)
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isAppInstalled, setIsAppInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches ?? false)
  const [cashierName, setCashierName] = useState(() => readStored('purela.cashierName', 'Purela Cashier'))
  const [cashierRole, setCashierRole] = useState(() => readStored('purela.cashierRole', 'Cashier'))
  const [loginForm, setLoginForm] = useState<LoginForm>(() => ({
    ...emptyLoginForm,
    name: readStored('purela.cashierName', ''),
  }))

  useEffect(() => {
    let cancelled = false

    const loadSupabaseData = async () => {
      if (!supabase) return

      await flushPendingSupabaseData()

      const [productsResult, customersResult, prescriptionsResult, salesResult] = await Promise.all([
        supabase.from('products').select('*').order('id'),
        supabase.from('customers').select('*').order('id'),
        supabase.from('prescriptions').select('*').order('id'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }),
      ])

      const firstError = productsResult.error ?? customersResult.error ?? prescriptionsResult.error ?? salesResult.error
      if (firstError) {
        setToast('Database tables are missing. Run supabase.schema.sql in SQL editor.')
        return
      }

      if (cancelled) return

      const productRows = (productsResult.data ?? []) as ProductRow[]
      const customerRows = (customersResult.data ?? []) as CustomerRow[]
      const prescriptionRows = (prescriptionsResult.data ?? []) as PrescriptionRow[]
      const saleRows = (salesResult.data ?? []) as SaleRow[]
      const pendingTables = readStored<string[]>(pendingSyncKey, [])
      const pendingDeletes = readStored<Record<string, Array<number | string>>>(pendingDeleteKey, {})
      const localProducts = readStored<Medicine[]>('purela.clean.inventory', initialInventory)
      const localCustomers = readStored<Customer[]>('purela.customers', initialCustomers)
      const localPrescriptions = readStored<Prescription[]>('purela.clean.prescriptions', initialPrescriptions)
      const localSales = readStored<Sale[]>('purela.clean.sales', initialSales)
      const remotePrescriptions = prescriptionRows.map(rowToPrescription)
      const remoteSales = saleRows.map(rowToSale)
      const mergedProducts = mergeProducts(productRows, localProducts, pendingDeletes.products, pendingTables.includes('products'))
      const mergedCustomers = mergeCustomers(customerRows, localCustomers, pendingTables.includes('customers'))
      const mergedPrescriptions = mergePrescriptions(remotePrescriptions, localPrescriptions, pendingTables.includes('prescriptions'))
      const mergedSales = mergeSales(remoteSales, localSales, pendingTables.includes('sales'))

      if (mergedProducts.length !== productRows.length || pendingTables.includes('products')) {
        void syncSupabase('products', mergedProducts)
      }
      if (mergedCustomers.length !== customerRows.length || pendingTables.includes('customers')) {
        void syncSupabase('customers', mergedCustomers)
      }
      if (mergedPrescriptions.length !== remotePrescriptions.length || pendingTables.includes('prescriptions')) {
        void syncSupabase('prescriptions', mergedPrescriptions.map(prescriptionToRow))
      }
      if (mergedSales.length !== remoteSales.length || pendingTables.includes('sales')) {
        void syncSupabase('sales', mergedSales.map(saleToRow))
      }

      setInventory(mergedProducts)
      setCustomers(mergedCustomers)
      setPrescriptions(mergedPrescriptions)
      setSales(mergedSales)
      writeStored('purela.clean.inventory', mergedProducts)
      writeStored('purela.customers', mergedCustomers)
      writeStored('purela.clean.prescriptions', mergedPrescriptions)
      writeStored('purela.clean.sales', mergedSales)
    }

    void loadSupabaseData()

    const handleOnline = () => {
      void loadSupabaseData()
    }

    const syncChannel = supabase
      ?.channel('purela-pos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void loadSupabaseData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        void loadSupabaseData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, () => {
        void loadSupabaseData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        void loadSupabaseData()
      })
      .subscribe()

    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      if (syncChannel) {
        void supabase?.removeChannel(syncChannel)
      }
    }
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsAppInstalled(true)
      setToast('PURELA PHARMACY app installed.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId)
  const currentShift = getCurrentShift()
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart])
  const discount = subtotal > 50000 ? subtotal * 0.05 : 0
  const total = subtotal - discount

  const lowStock = inventory.filter((item) => item.stock <= item.reorder)
  const expiringSoon = inventory.filter((item) => item.expiry < '2027-01-01')
  const rxFilled = prescriptions.filter((rx) => rx.status === 'Filled' || rx.status === 'Released').length
  const netSales = sales.reduce((sum, sale) => sum + sale.total, 0)
  const paymentTotals = {
    Cash: sales.filter((sale) => sale.payment === 'Cash').reduce((sum, sale) => sum + sale.total, 0),
    Transfer: sales.filter((sale) => sale.payment === 'Transfer').reduce((sum, sale) => sum + sale.total, 0),
    'POS Card': sales.filter((sale) => sale.payment === 'POS Card').reduce((sum, sale) => sum + sale.total, 0),
    Credit: sales.filter((sale) => sale.payment === 'Credit').reduce((sum, sale) => sum + sale.total, 0),
  }
  const canManageProducts = cashierRole === 'Admin'

  const filteredInventory = inventory.filter((item) => {
    const value = `${item.name} ${item.generic} ${item.category} ${item.batch} ${item.location}`.toLowerCase()
    return value.includes(query.toLowerCase())
  })

  const filteredInventoryRows = inventory.filter((item) => {
    const value = `${item.name} ${item.generic} ${item.category} ${item.batch} ${item.location} ${item.supplier}`.toLowerCase()
    return value.includes(inventoryQuery.toLowerCase())
  })

  const salesData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return days.map((day, index) => {
      const daySales = sales.filter((_, saleIndex) => saleIndex % 7 === index)
      return {
        day,
        sales: daySales.reduce((sum, sale) => sum + sale.total, 0),
        scripts: prescriptions.filter((_, rxIndex) => rxIndex % 7 === index).length,
      }
    })
  }, [prescriptions, sales])

  const persistInventory = (next: Medicine[]) => {
    setInventory(next)
    writeStored('purela.clean.inventory', next)
    void syncSupabase('products', next)
  }

  const persistCustomers = (next: Customer[]) => {
    setCustomers(next)
    writeStored('purela.customers', next)
    void syncSupabase('customers', next)
  }

  const persistPrescriptions = (next: Prescription[]) => {
    setPrescriptions(next)
    writeStored('purela.clean.prescriptions', next)
    void syncSupabase('prescriptions', next.map(prescriptionToRow))
  }

  const persistSales = (next: Sale[]) => {
    setSales(next)
    writeStored('purela.clean.sales', next)
    void syncSupabase('sales', next.map(saleToRow))
  }

  const addToCart = (medicine: Medicine) => {
    if (medicine.stock <= 0) {
      setToast(`${medicine.name} is out of stock.`)
      return
    }

    setCart((current) => {
      const existing = current.find((line) => line.id === medicine.id)
      const currentQty = existing?.qty ?? 0
      if (currentQty >= medicine.stock) {
        setToast(`Only ${medicine.stock} units available for ${medicine.name}.`)
        return current
      }
      if (existing) {
        return current.map((line) => (line.id === medicine.id ? { ...line, qty: line.qty + 1 } : line))
      }
      return [...current, { ...medicine, qty: 1 }]
    })
  }

  const updateQty = (id: number, direction: 1 | -1) => {
    const medicine = inventory.find((item) => item.id === id)
    setCart((current) =>
      current
        .map((line) => {
          if (line.id !== id) return line
          const qty = Math.max(0, Math.min(line.qty + direction, medicine?.stock ?? line.qty))
          return { ...line, qty }
        })
        .filter((line) => line.qty > 0),
    )
  }

  const removeFromCart = (id: number) => {
    setCart((current) => current.filter((line) => line.id !== id))
  }

  const completeSale = () => {
    if (cart.length === 0) {
      setToast('Add at least one medicine to complete a sale.')
      return
    }

    const rxLine = cart.find((item) => item.prescription)
    if (rxLine && !selectedCustomer) {
      setToast('Attach a patient profile before selling prescription medicine.')
      return
    }

    const stockIssue = cart.find((line) => {
      const medicine = inventory.find((item) => item.id === line.id)
      return !medicine || line.qty > medicine.stock
    })

    if (stockIssue) {
      setToast(`${stockIssue.name} does not have enough stock.`)
      return
    }

    const sale: Sale = {
      id: `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      patient: selectedCustomer?.name ?? 'Walk-in customer',
      cashier: cashierName,
      payment,
      shift: currentShift,
      subtotal,
      discount,
      total,
      items: cart,
      createdAt: new Date().toISOString(),
    }

    const nextInventory = inventory.map((item) => {
      const soldLine = cart.find((line) => line.id === item.id)
      return soldLine ? { ...item, stock: item.stock - soldLine.qty } : item
    })

    const nextCustomers = selectedCustomer
      ? customers.map((customer) =>
          customer.id === selectedCustomer.id
            ? { ...customer, last: `Purchased ${cart[0].name}`, status: 'Served today' }
            : customer,
        )
      : customers

    persistInventory(nextInventory)
    persistCustomers(nextCustomers)
    persistSales([sale, ...sales])
    setCart([])
    setLastReceipt(sale)
    setToast(`Sale ${sale.id} completed successfully.`)
  }

  const openAddProduct = () => {
    if (!canManageProducts) {
      setToast('Only Admin can add products.')
      return
    }

    setEditingProductId(null)
    setMedicineForm(emptyMedicineForm)
    setShowProductModal(true)
  }

  const editProduct = (medicine: Medicine) => {
    if (!canManageProducts) {
      setToast('Only Admin can edit products.')
      return
    }

    setEditingProductId(medicine.id)
    setMedicineForm({
      name: medicine.name,
      generic: medicine.generic,
      category: medicine.category,
      batch: medicine.batch,
      stock: String(medicine.stock),
      reorder: String(medicine.reorder),
      expiry: medicine.expiry,
      price: String(medicine.price),
      prescription: medicine.prescription,
      location: medicine.location,
      supplier: medicine.supplier,
    })
    setShowProductModal(true)
  }

  const deleteProduct = (medicine: Medicine) => {
    if (!canManageProducts) {
      setToast('Only Admin can delete products.')
      return
    }

    const confirmed = window.confirm(`Delete ${medicine.name} from inventory? This cannot be undone.`)
    if (!confirmed) return

    const nextInventory = inventory.filter((item) => item.id !== medicine.id)
    persistInventory(nextInventory)
    if (supabase && navigator.onLine) {
      void supabase
        .from('products')
        .delete()
        .eq('id', medicine.id)
        .then((result) => {
          if (result.error) {
            markPendingDelete('products', medicine.id)
          }
        })
    } else {
      markPendingDelete('products', medicine.id)
    }
    setCart((current) => current.filter((item) => item.id !== medicine.id))
    setToast(`${medicine.name} deleted from inventory.`)
  }

  const saveMedicine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const stock = Number(medicineForm.stock)
    const reorder = Number(medicineForm.reorder)
    const price = Number(medicineForm.price)
    const missingFields = [
      !medicineForm.name.trim() && 'Product Name',
      !medicineForm.generic.trim() && 'Generic Name',
      !medicineForm.category.trim() && 'Category',
      !medicineForm.price.trim() && 'Price',
      !medicineForm.stock.trim() && 'Initial Stock',
      !medicineForm.reorder.trim() && 'Reorder Level',
      !medicineForm.expiry.trim() && 'Expiry Date',
      !medicineForm.location.trim() && 'Shelf Location',
      !medicineForm.supplier.trim() && 'Supplier',
    ].filter(Boolean) as string[]

    if (missingFields.length > 0) {
      setFieldPopup(missingFields)
      setToast('Complete all required product fields.')
      return
    }

    if (Number.isNaN(stock) || stock < 0 || Number.isNaN(reorder) || reorder < 0 || Number.isNaN(price) || price <= 0) {
      setFieldPopup(['Price must be above 0', 'Stock and reorder level must be 0 or above'])
      setToast('Correct the product number fields.')
      return
    }

    const batchNumber = medicineForm.batch.trim() || generateBatchNumber()

    const medicine: Medicine = {
      id: editingProductId ?? nextOfflineSafeId(),
      name: medicineForm.name.trim(),
      generic: medicineForm.generic.trim(),
      category: medicineForm.category.trim(),
      batch: batchNumber,
      stock,
      reorder,
      expiry: medicineForm.expiry,
      price,
      prescription: medicineForm.prescription,
      location: medicineForm.location.trim(),
      supplier: medicineForm.supplier.trim(),
    }

    const nextInventory = editingProductId
      ? inventory.map((item) => (item.id === editingProductId ? medicine : item))
      : [medicine, ...inventory]

    persistInventory(nextInventory)
    setCart((current) => current.map((item) => (item.id === medicine.id ? { ...medicine, qty: item.qty } : item)))
    setMedicineForm(emptyMedicineForm)
    setShowProductModal(false)
    setEditingProductId(null)
    setToast(`${medicine.name} ${editingProductId ? 'updated' : 'added'} in inventory.`)
  }

  const addCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!customerForm.name || !customerForm.phone) {
      setToast('Customer name and phone are required.')
      return
    }

    const customer: Customer = {
      id: nextOfflineSafeId(),
      name: customerForm.name,
      phone: customerForm.phone,
      plan: customerForm.plan || 'Private pay',
      allergies: customerForm.allergies || 'None recorded',
      last: 'New profile',
      status: 'Ready',
    }

    persistCustomers([customer, ...customers])
    setSelectedCustomerId(customer.id)
    setCustomerForm(emptyCustomerForm)
    setToast(`${customer.name} profile created and attached.`)
  }

  const advancePrescription = (id: string) => {
    const next = prescriptions.map((rx) => (rx.id === id ? { ...rx, status: statusFlow[rx.status] } : rx))
    persistPrescriptions(next)
    setToast(`${id} moved to next workflow step.`)
  }

  const adjustStock = (id: number, amount: number) => {
    const next = inventory.map((item) => (item.id === id ? { ...item, stock: Math.max(0, item.stock + amount) } : item))
    persistInventory(next)
  }

  const resetDemoData = () => {
    setInventory(initialInventory)
    setCustomers(initialCustomers)
    setPrescriptions(initialPrescriptions)
    setSales(initialSales)
    writeStored('purela.clean.inventory', initialInventory)
    writeStored('purela.customers', initialCustomers)
    writeStored('purela.clean.prescriptions', initialPrescriptions)
    writeStored('purela.clean.sales', initialSales)
    void (async () => {
      await clearSupabaseTable('sales', true)
      await clearSupabaseTable('prescriptions', true)
      await clearSupabaseTable('customers')
      await clearSupabaseTable('products')
      await syncSupabase('products', initialInventory)
      await syncSupabase('customers', initialCustomers)
      await syncSupabase('prescriptions', initialPrescriptions.map(prescriptionToRow))
      await syncSupabase('sales', initialSales.map(saleToRow))
    })()
    setCart([])
    setSelectedCustomerId('walk-in')
    setToast('Inventory products cleared. Customer examples restored.')
  }

  const resolveCashierAccess = async (identifier: string, password: string) => {
    const loginId = identifier.trim()
    const fallback = { name: cashierDisplayName(loginId), role: 'Cashier' }

    if (!supabase) return fallback

    if (loginId.includes('@')) {
      const email = loginId.toLowerCase()
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError || !authData.user) return null

      const metadata = authData.user.user_metadata ?? {}
      const profileResult = await supabase
        .from('profiles')
        .select('email,name,role')
        .eq('email', email)
        .maybeSingle()

      const profile = profileResult.error ? null : (profileResult.data as ProfileRow | null)
      const metadataName = typeof metadata.name === 'string' ? metadata.name : typeof metadata.full_name === 'string' ? metadata.full_name : ''
      const metadataRole = typeof metadata.role === 'string' ? metadata.role : ''

      return {
        name: cashierDisplayName(metadataName || profile?.name || email),
        role: normalizeRole(metadataRole || profile?.role),
      }
    }

    const profileResult = await supabase
      .from('profiles')
      .select('email,name,role')
      .ilike('name', loginId)
      .maybeSingle()

    if (profileResult.error || !profileResult.data) return fallback

    const profile = profileResult.data as ProfileRow
    return {
      name: cashierDisplayName(profile.name || profile.email || loginId),
      role: normalizeRole(profile.role),
    }
  }

  const loginCashier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const loginId = loginForm.name.trim()

    if (!loginId || !loginForm.password.trim()) {
      setToast('Enter cashier name and password to login.')
      return
    }

    const access = await resolveCashierAccess(loginId, loginForm.password)

    if (!access) {
      setToast('Supabase login failed. Check email and password.')
      return
    }

    setCashierName(access.name)
    setCashierRole(access.role)
    writeStored('purela.cashierName', access.name)
    writeStored('purela.cashierRole', access.role)
    setIsLoggedIn(true)
    setLoginForm({ ...emptyLoginForm, name: access.name })
    setToast(`${access.name} logged in as ${access.role}.`)
  }

  const logoutCashier = () => {
    if (supabase) {
      void supabase.auth.signOut()
    }
    setIsLoggedIn(false)
    setLoginForm({ ...emptyLoginForm, name: cashierName })
    setToast('Enter cashier name and password to login.')
  }

  const installApp = async () => {
    if (isAppInstalled) {
      setToast('PURELA PHARMACY is already installed.')
      return
    }

    if (!installPrompt) {
      setToast('Install option is preparing. If it does not appear, use your browser menu to install the app.')
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice

    if (choice.outcome === 'accepted') {
      setToast('Installing PURELA PHARMACY app.')
      setIsAppInstalled(true)
    } else {
      setToast('App install cancelled.')
    }

    setInstallPrompt(null)
  }

  if (!isLoggedIn) {
    return (
      <main className="login-page">
        <form className="login-dashboard" onSubmit={loginCashier}>
          <div className="login-brand">
            <div className="brand-mark">
              <Pill size={28} />
            </div>
            <div>
              <p className="eyebrow">Secure Pharmacy POS</p>
              <h1>PURELA PHARMACY</h1>
              <span>1 Bakole Street, Ibeju Lekki</span>
            </div>
          </div>

          <div className="login-panel">
            <div>
              <h2>Cashier Login</h2>
              <p>Sign in to open the sales register, inventory, prescriptions, customers, and reports.</p>
            </div>

            <div className="login-form-grid">
              <label>
                <span>Cashier Name or Email</span>
                <input autoFocus placeholder="Enter Supabase email or cashier name" value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} />
              </label>
              <label>
                <span>Password</span>
                <input placeholder="Enter password" type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
              </label>
            </div>

            {toast.includes('login') && <p className="login-warning">{toast}</p>}

            <button className="primary login-submit" type="submit">
              <UserRound size={18} />
              Login to POS
            </button>
          </div>

          <div className="login-shifts">
            <div>
              <strong>Morning Shift</strong>
              <span>7am to 3pm</span>
            </div>
            <div>
              <strong>Afternoon Shift</strong>
              <span>3pm to 11pm</span>
            </div>
          </div>
        </form>
      </main>
    )
  }

  return (
    <div className={activeTab === 'Register' ? 'app-shell sale-shell' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Pill size={22} />
          </div>
          <div>
            <strong>PURELA PHARMACY</strong>
            <span>1 Bakole Street, Ibeju Lekki</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                aria-current={activeTab === item.label ? 'page' : undefined}
                className={activeTab === item.label ? 'active' : ''}
                key={item.label}
                onClick={() => setActiveTab(item.label)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="secure-panel">
          <ShieldCheck size={20} />
          <strong>Compliance mode</strong>
          <span>Role-based access, audit logs, prescription checks, and controlled item prompts.</span>
        </div>
      </aside>

      <main className={activeTab === 'Register' ? 'workspace sale-workspace' : 'workspace'}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{moduleCopy[activeTab].eyebrow}</p>
            <h1>{moduleCopy[activeTab].title}</h1>
          </div>
          <div className="topbar-actions">
            {!isAppInstalled && (
              <button className="install-top" onClick={installApp} type="button">
                <Download size={18} />
                Install App
              </button>
            )}
            <button className="login-top" onClick={logoutCashier} type="button">
              <LogOut size={18} />
              Logout
            </button>
            <div className="user-chip">
              <UserRound size={18} />
              <span>{cashierDisplayName(cashierName)} ({cashierRole})</span>
            </div>
            <div className="shift-chip">
              <span>{currentShift}</span>
              <small>7am-3pm / 3pm-11pm</small>
            </div>
          </div>
        </header>

        <div className={toast.includes('success') || toast.includes('Ready') ? 'notice good' : 'notice'}>
          <Activity size={17} />
          <span>{toast}</span>
        </div>

        {activeTab === 'Register' && (
          <section className="register-grid">
            <div className="register-panel">
              <div className="panel-heading">
                <div>
                  <h2>Medicine Search</h2>
                  <p>Search, scan, add to cart, and block unsafe sale conditions.</p>
                </div>
                <button className="icon-text" onClick={() => setQuery('')} type="button">
                  <Filter size={17} />
                  Clear
                </button>
              </div>

              <label className="search-box">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search medicine, batch, category, shelf..."
                />
              </label>

              <div className="product-list">
                {filteredInventory.map((item) => (
                  <button className="product-row" key={item.id} onClick={() => addToCart(item)} type="button">
                    <div className="medicine-icon">
                      {item.prescription ? <FileText size={18} /> : <Pill size={18} />}
                    </div>
                    <div className="product-main">
                      <strong>{item.name}</strong>
                      <span>
                        {item.generic} - {item.category} - {item.location} - Batch {item.batch}
                      </span>
                    </div>
                    <div className="product-meta">
                      <strong>{formatMoney(item.price)}</strong>
                      <span className={item.stock <= item.reorder ? 'danger' : ''}>{item.stock} in stock</span>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            </div>

            <div className="cart-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Current Sale</h2>
                  <p>Checkout validates stock and prescription requirements.</p>
                </div>
                <button className="icon-only" onClick={() => setCart([])} type="button" aria-label="New sale" title="New sale">
                  <Plus size={18} />
                </button>
              </div>

              <div className="customer-band">
                <UserRound size={20} />
                <div>
                  <strong>{selectedCustomer?.name ?? 'Walk-in customer'}</strong>
                  <span>{selectedCustomer ? `${selectedCustomer.plan} - Allergies: ${selectedCustomer.allergies}` : 'No patient profile attached'}</span>
                </div>
              </div>

              <label className="field">
                <span>Attach customer</span>
                <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value === 'walk-in' ? 'walk-in' : Number(event.target.value))}>
                  <option value="walk-in">Walk-in customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="cart-lines">
                {cart.length === 0 && <div className="empty-state">No items in cart. Add medicine from the search list.</div>}
                {cart.map((item) => (
                  <div className="cart-line" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.prescription ? 'Prescription required' : 'OTC sale'}</span>
                    </div>
                    <div className="qty-control">
                      <button onClick={() => updateQty(item.id, -1)} type="button" aria-label={`Decrease ${item.name}`}>
                        -
                      </button>
                      <span>{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} type="button" aria-label={`Increase ${item.name}`}>
                        +
                      </button>
                    </div>
                    <strong>{formatMoney(item.price * item.qty)}</strong>
                    <button className="ghost-icon" onClick={() => removeFromCart(item.id)} type="button" aria-label="Remove item">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="payment-tabs">
                {['Cash', 'Transfer', 'POS Card', 'Credit'].map((method) => (
                  <button className={payment === method ? 'selected' : ''} onClick={() => setPayment(method)} key={method} type="button">
                    {method === 'Cash' && <WalletCards size={16} />}
                    {method === 'Transfer' && <BadgeCheck size={16} />}
                    {method === 'POS Card' && <CreditCard size={16} />}
                    {method === 'Credit' && <ReceiptText size={16} />}
                    {method}
                  </button>
                ))}
              </div>

              <div className="totals">
                <span>Subtotal <strong>{formatMoney(subtotal)}</strong></span>
                <span>Discount <strong>-{formatMoney(discount)}</strong></span>
                <span className="grand-total">Total <strong>{formatMoney(total)}</strong></span>
              </div>

              <div className="checkout-actions">
                <button className="secondary" onClick={() => setLastReceipt(sales[0] ?? null)} type="button">
                  <Printer size={18} />
                  Last Receipt
                </button>
                <button className="primary" onClick={completeSale} type="button">
                  <Check size={18} />
                  Complete Sale
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Prescriptions' && (
          <section className="ops-panel">
            <div className="panel-heading">
              <div>
                <h2>Prescription Queue</h2>
                <p>Advance each prescription through insurance, clinical check, verification, fill, and release.</p>
              </div>
              <button className="icon-text" onClick={() => setActiveTab('Prescriptions')} type="button">
                <Syringe size={17} />
                Review
              </button>
            </div>
            <div className="queue-table">
              {prescriptions.map((rx) => {
                const patient = customers.find((customer) => customer.id === rx.patientId)
                const medicine = inventory.find((item) => item.id === rx.medicationId)
                return (
                  <div className="queue-row" key={rx.id}>
                    <strong>{rx.id}</strong>
                    <span>{patient?.name ?? 'Unknown patient'}</span>
                    <span>{medicine?.name ?? 'Unknown medicine'}</span>
                    <span className="status">{rx.status}</span>
                    <span>{rx.wait}</span>
                    <button className="mini-action" disabled={rx.status === 'Released'} onClick={() => advancePrescription(rx.id)} type="button">
                      {rx.status === 'Released' ? 'Done' : 'Advance'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {activeTab === 'Inventory' && (
          <section className="module-grid single">
            <div className="ops-panel wide">
              <div className="panel-heading">
                <div>
                  <h2>Inventory Control</h2>
                  <p>Stock counts, batch, expiry, reorder point, location, supplier, and dispense type.</p>
                </div>
                {canManageProducts && (
                  <button className="icon-text primary-lite" onClick={openAddProduct} type="button">
                    <Plus size={17} />
                    Add Product
                  </button>
                )}
              </div>

              <div className="inventory-search-row">
                <label className="search-box inventory-search">
                  <Search size={19} />
                  <input
                    value={inventoryQuery}
                    onChange={(event) => setInventoryQuery(event.target.value)}
                    placeholder="Search products by name, generic, batch, shelf, supplier..."
                  />
                </label>
                <button className="icon-text" onClick={() => setInventoryQuery('')} type="button">
                  <Filter size={17} />
                  Clear
                </button>
              </div>

              <div className="inventory-table">
                {filteredInventoryRows.length === 0 && (
                  <div className="empty-state">No products match your inventory search.</div>
                )}
                {filteredInventoryRows.map((item) => (
                  <div className="inventory-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.generic} - {item.category}</span>
                    </div>
                    <span>{item.batch}</span>
                    <span>{item.expiry}</span>
                    <span className={item.stock <= item.reorder ? 'danger' : ''}>{item.stock} units</span>
                    <span>{item.location}</span>
                    {canManageProducts ? (
                      <div className="row-actions">
                        <button onClick={() => adjustStock(item.id, -1)} type="button">-</button>
                        <button onClick={() => adjustStock(item.id, 1)} type="button">+</button>
                        <button onClick={() => editProduct(item)} type="button">Edit</button>
                        <button className="danger-action" onClick={() => deleteProduct(item)} type="button">Delete</button>
                      </div>
                    ) : (
                      <span className="admin-only">Admin only</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Customers' && (
          <section className="module-grid">
            <div className="customer-section">
              <div className="panel-heading">
                <div>
                  <h2>Patient Profiles</h2>
                  <p>Insurance, allergies, refill status, phone number, and consultation flags.</p>
                </div>
              </div>
              <div className="customer-grid">
                {customers.map((customer) => (
                  <button className="customer-card" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} type="button">
                    <div className="avatar">{customer.name.slice(0, 1)}</div>
                    <strong>{customer.name}</strong>
                    <span>{customer.phone}</span>
                    <span>{customer.plan}</span>
                    <p>{customer.last}</p>
                    <div>
                      <small>{customer.allergies}</small>
                      <b>{customer.status}</b>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <form className="form-panel" onSubmit={addCustomer}>
              <h2>Add Customer</h2>
              <div className="form-grid one">
                <input placeholder="Full name" value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
                <input placeholder="Phone number" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
                <input placeholder="Insurance plan" value={customerForm.plan} onChange={(event) => setCustomerForm({ ...customerForm, plan: event.target.value })} />
                <input placeholder="Allergies" value={customerForm.allergies} onChange={(event) => setCustomerForm({ ...customerForm, allergies: event.target.value })} />
              </div>
              <button className="primary full" type="submit">
                <Plus size={18} />
                Add Customer
              </button>
            </form>
          </section>
        )}

        {activeTab === 'Reports' && (
          <section className="reports-stack">
            <section className="metric-strip" aria-label="Business metrics">
              <Metric icon={WalletCards} label="Net sales" value={formatMoney(netSales)} trend={`${sales.length} completed`} />
              <Metric icon={ReceiptText} label="Transactions" value={String(sales.length)} trend={`${cart.length} cart lines`} />
              <Metric icon={Stethoscope} label="Rx filled" value={String(rxFilled)} trend={`${prescriptions.length} active scripts`} />
              <Metric icon={AlertTriangle} label="Stock alerts" value={String(lowStock.length + expiringSoon.length)} trend={`${lowStock.length} reorder`} warning />
            </section>

            <section className="metric-strip" aria-label="Payment totals">
              <Metric icon={WalletCards} label="Cash sales" value={formatMoney(paymentTotals.Cash)} trend="Cash payments" />
              <Metric icon={BadgeCheck} label="Transfer" value={formatMoney(paymentTotals.Transfer)} trend="Bank transfers" />
              <Metric icon={CreditCard} label="POS card" value={formatMoney(paymentTotals['POS Card'])} trend="Card terminal" />
              <Metric icon={ReceiptText} label="Credit" value={formatMoney(paymentTotals.Credit)} trend="Pay later" warning />
            </section>

            <div className="analytics-grid">
              <ChartPanel title="Sales Trend" description="Revenue from completed local transactions.">
                <AreaChart data={salesData}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e6e8eb" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area dataKey="sales" stroke="#0f766e" fill="url(#salesFill)" strokeWidth={3} />
                </AreaChart>
              </ChartPanel>

              <ChartPanel title="Prescription Volume" description="Current prescription workflow load.">
                <BarChart data={salesData}>
                  <CartesianGrid stroke="#e6e8eb" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="scripts" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartPanel>
            </div>

            <div className="ops-panel">
              <div className="panel-heading">
                <div>
                  <h2>Sales History</h2>
                  <p>Completed sales remain stored in browser local storage until Supabase is connected.</p>
                </div>
              </div>
              <div className="sales-list">
                {sales.map((sale) => (
                  <button className="sale-row" key={sale.id} onClick={() => setLastReceipt(sale)} type="button">
                    <strong>{sale.id}</strong>
                    <span>{sale.patient}</span>
                    <span>{sale.payment}</span>
                    <span>{sale.shift ?? 'Not recorded'}</span>
                    <span>{new Date(sale.createdAt).toLocaleString()}</span>
                    <b>{formatMoney(sale.total)}</b>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Settings' && (
          <section className="settings-grid">
            <div className="settings-panel">
              <div className="panel-heading">
                <div>
                  <h2>Supabase Connection</h2>
                  <p>Database, authentication, and sync are ready for your project keys.</p>
                </div>
                <BadgeCheck size={20} />
              </div>
              <div className="setting-list">
                <div>
                  <strong>Connection status</strong>
                  <span>{isSupabaseConfigured ? 'Supabase environment variables detected.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.'}</span>
                </div>
                <div>
                  <strong>Database schema</strong>
                  <span>Run supabase.schema.sql in Supabase SQL editor before wiring live reads and writes.</span>
                </div>
                <div>
                  <strong>Local data mode</strong>
                  <span>Sales, stock changes, patients, and prescription status currently persist in browser local storage.</span>
                </div>
              </div>
              <button className="secondary full" onClick={resetDemoData} type="button">Clear Products</button>
            </div>

            <div className="settings-panel">
              <div className="panel-heading">
                <div>
                  <h2>Pharmacy Controls</h2>
                  <p>Operational safeguards expected in a professional dispensary.</p>
                </div>
                <ShieldCheck size={20} />
              </div>
              <div className="setting-list">
                <div>
                  <strong>Prescription verification</strong>
                  <span>Prescription items require an attached patient profile before checkout.</span>
                </div>
                <div>
                  <strong>Inventory audit behavior</strong>
                  <span>Checkout decreases stock, stock controls adjust units, and low-stock warnings update immediately.</span>
                </div>
                <div>
                  <strong>Receipt and reporting</strong>
                  <span>Each sale generates a receipt and appears in sales history and reports.</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {showProductModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add product dashboard">
          <form className="product-modal" onSubmit={saveMedicine}>
            <div className="modal-titlebar">
              <div>
                <p className="eyebrow">PURELA PHARMACY INVENTORY</p>
                <h2>{editingProductId ? 'Edit Product Dashboard' : 'Add Product Dashboard'}</h2>
              </div>
              <button
                className="icon-only"
                onClick={() => {
                  setShowProductModal(false)
                  setEditingProductId(null)
                  setMedicineForm(emptyMedicineForm)
                }}
                type="button"
                aria-label="Close add product"
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-grid product-form-grid">
              <label>
                <span>Product Name</span>
                <input placeholder="Example: Artemether Lumefantrine" value={medicineForm.name} onChange={(event) => setMedicineForm({ ...medicineForm, name: event.target.value })} />
              </label>
              <label>
                <span>Generic Name</span>
                <input placeholder="Example: Artemether/Lumefantrine" value={medicineForm.generic} onChange={(event) => setMedicineForm({ ...medicineForm, generic: event.target.value })} />
              </label>
              <label>
                <span>Category</span>
                <input placeholder="Antimalarial, Antibiotic, OTC..." value={medicineForm.category} onChange={(event) => setMedicineForm({ ...medicineForm, category: event.target.value })} />
              </label>
              <label>
                <span>Batch Number (optional)</span>
                <input placeholder="Leave blank to auto-generate" value={medicineForm.batch} onChange={(event) => setMedicineForm({ ...medicineForm, batch: event.target.value })} />
              </label>
              <label>
                <span>Price (Naira)</span>
                <input min="0" step="0.01" placeholder="0.00" type="number" value={medicineForm.price} onChange={(event) => setMedicineForm({ ...medicineForm, price: event.target.value })} />
              </label>
              <label>
                <span>Initial Stock</span>
                <input min="0" placeholder="0" type="number" value={medicineForm.stock} onChange={(event) => setMedicineForm({ ...medicineForm, stock: event.target.value })} />
              </label>
              <label>
                <span>Reorder Level</span>
                <input min="0" placeholder="10" type="number" value={medicineForm.reorder} onChange={(event) => setMedicineForm({ ...medicineForm, reorder: event.target.value })} />
              </label>
              <label>
                <span>Expiry Date</span>
                <input type="date" value={medicineForm.expiry} onChange={(event) => setMedicineForm({ ...medicineForm, expiry: event.target.value })} />
              </label>
              <label>
                <span>Shelf Location</span>
                <input placeholder="A1, OTC-02, Fridge..." value={medicineForm.location} onChange={(event) => setMedicineForm({ ...medicineForm, location: event.target.value })} />
              </label>
              <label>
                <span>Supplier</span>
                <input placeholder="Supplier name" value={medicineForm.supplier} onChange={(event) => setMedicineForm({ ...medicineForm, supplier: event.target.value })} />
              </label>
            </div>

            <label className="checkbox-line modal-check">
              <input checked={medicineForm.prescription} onChange={(event) => setMedicineForm({ ...medicineForm, prescription: event.target.checked })} type="checkbox" />
              Prescription required
            </label>

            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => {
                  setShowProductModal(false)
                  setEditingProductId(null)
                  setMedicineForm(emptyMedicineForm)
                }}
                type="button"
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                <Plus size={18} />
                {editingProductId ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {fieldPopup.length > 0 && (
        <div className="modal-backdrop field-popup-layer" role="dialog" aria-modal="true" aria-label="Missing product fields">
          <div className="field-popup">
            <div className="modal-titlebar">
              <div>
                <p className="eyebrow">REQUIRED FIELDS</p>
                <h2>Fill the missing product details</h2>
              </div>
              <button className="icon-only" onClick={() => setFieldPopup([])} type="button" aria-label="Close missing fields popup">
                <X size={18} />
              </button>
            </div>
            <p>All required fields must be filled before continuing. Batch number can be left empty when adding products.</p>
            <div className="missing-list">
              {fieldPopup.map((field) => (
                <span key={field}>{field}</span>
              ))}
            </div>
            <button className="primary full" onClick={() => setFieldPopup([])} type="button">
              Fill Fields
            </button>
          </div>
        </div>
      )}

      {lastReceipt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Receipt">
          <div className="receipt-modal">
            <div className="panel-heading">
              <div>
                <h2>Receipt {lastReceipt.id}</h2>
                <p>{new Date(lastReceipt.createdAt).toLocaleString()}</p>
              </div>
              <button className="icon-only" onClick={() => setLastReceipt(null)} type="button" aria-label="Close receipt">
                <X size={18} />
              </button>
            </div>
            <div className="receipt-body">
              <span>Patient <strong>{lastReceipt.patient}</strong></span>
              <span>Cashier <strong>{cashierDisplayName(lastReceipt.cashier ?? 'Purela Cashier')}</strong></span>
              <span>Payment <strong>{lastReceipt.payment}</strong></span>
              <span>Shift <strong>{lastReceipt.shift ?? 'Not recorded'}</strong></span>
              {lastReceipt.items.map((item) => (
                <span key={`${lastReceipt.id}-${item.id}`}>
                  {item.qty} x {item.name} <strong>{formatMoney(item.qty * item.price)}</strong>
                </span>
              ))}
              <span>Subtotal <strong>{formatMoney(lastReceipt.subtotal)}</strong></span>
              <span>Discount <strong>-{formatMoney(lastReceipt.discount)}</strong></span>
              <span className="grand-total">Total <strong>{formatMoney(lastReceipt.total)}</strong></span>
            </div>
            <button className="primary full" onClick={() => window.print()} type="button">
              <Printer size={18} />
              Print Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type MetricProps = {
  icon: typeof WalletCards
  label: string
  value: string
  trend: string
  warning?: boolean
}

function Metric({ icon: Icon, label, value, trend, warning = false }: MetricProps) {
  return (
    <div className="metric-card">
      <div className={warning ? 'metric-icon warning' : 'metric-icon'}>
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  )
}

type ChartPanelProps = {
  title: string
  description: string
  children: ReactElement
}

function ChartPanel({ title, description, children }: ChartPanelProps) {
  return (
    <div className="chart-panel">
      <div className="panel-heading compact">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export default App
