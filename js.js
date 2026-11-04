/**
 * نظام المحاسبة وإدارة المشاريع السحابي (Clean ERP System)
 * كافة الأرقام والأرصدة والبيانات مستدعاة ديناميكياً من قاعدة بيانات Firebase Firestore
 * مع إمكانية إضافة ومسح المشاريع، وتعديل وحذف فواتير المبيعات والمشتريات بدقة محاسبية
 * النظام يتأقلم تلقائياً مع أي نوع نشاط تجاري (مطعم، محل، تجارة، خدمات، ...)
 */

// ===========================================================================================
// دوال معالجة وتنسيق الأرقام والعملات بدقة متناهية لمنع أي انهيار برمجي (Safe Number Formatting)
// ===========================================================================================
function safeNum(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    const num = parseFloat(val);
    return isNaN(num) ? fallback : num;
}

function formatMoney(val) {
    return safeNum(val).toFixed(2);
}

// ===========================================================================================
// قاموس أنواع النشاط التجاري - يُستخدم لتهيئة النظام حسب طبيعة كل مشروع
// ===========================================================================================
const BUSINESS_TYPES = {
    retail: {
        label: 'تجارة بالمفرق والجملة',
        icon: 'fa-store',
        unitLabel: 'قطعة',
        units: ['قطعة', 'كرتون', 'عبوة', 'دزينة', 'كيس'],
        hasPriceTiers: true,
        hasBarcode: true,
        hasStock: true,
        purchaseByUnit: true,
        freePurchase: false,   // المشتريات مرتبطة بالمخزون
        saleTip: 'يدعم الدفع المختلط بين حسابات متعددة',
        purchaseTip: 'توريد بضاعة وتحديث مخزون آلي بالتكلفة المتوسطة',
        categorySuggestions: ['ملابس', 'إلكترونيات', 'أحذية', 'إكسسوارات', 'عام'],
        rawMaterialCategories: []
    },
    food_restaurant: {
        label: 'مطعم وأكل سريع',
        icon: 'fa-utensils',
        unitLabel: 'حبة / وجبة',
        units: ['حبة', 'وجبة', 'طبق', 'كيلو', 'علبة', 'لتر'],
        hasPriceTiers: false,
        hasBarcode: false,
        hasStock: true,
        purchaseByUnit: false,
        freePurchase: true,   // ✅ مشتريات حرة (مواد خام لا تدخل مخزون المبيعات)
        saleTip: 'البيع بالوجبات أو الحبات أو الكيلو حسب الصنف',
        purchaseTip: 'تسجيل مصاريف المواد الخام (بطاطا، زيت، حمص...) بحرية دون ربط بالمخزون',
        categorySuggestions: ['مشويات', 'سندويشات', 'مشروبات', 'حلويات', 'وجبات'],
        rawMaterialCategories: ['خضروات', 'توابل', 'زيوت', 'بقوليات', 'لحوم', 'مواد تعبئة', 'غاز/وقود', 'متنوع']
    },
    food_grocery: {
        label: 'محل خضار وبقالة',
        icon: 'fa-carrot',
        unitLabel: 'كيلو',
        units: ['كيلو', 'حبة', 'كرتون', 'شوال', 'صندوق', 'لتر', 'باكيت'],
        hasPriceTiers: false,
        hasBarcode: false,
        hasStock: true,
        purchaseByUnit: true,
        freePurchase: false,  // مشتريات مرتبطة بالمخزون (تشتري نفس ما تبيع)
        saleTip: 'البيع بالكيلو أو الحبة أو الصندوق',
        purchaseTip: 'شراء الخضار والفواكه من الموردين بالكميات الكبيرة',
        categorySuggestions: ['خضروات', 'فواكه', 'بقوليات', 'توابل', 'مشروبات', 'مجمدات'],
        rawMaterialCategories: []
    },
    services: {
        label: 'خدمات وأعمال حرة',
        icon: 'fa-screwdriver-wrench',
        unitLabel: 'خدمة',
        units: ['خدمة', 'ساعة', 'يوم', 'مشروع'],
        hasPriceTiers: false,
        hasBarcode: false,
        hasStock: false,
        purchaseByUnit: false,
        freePurchase: true,   // ✅ مشتريات حرة (أدوات ومستلزمات)
        saleTip: 'فاتورة خدمة أو عمل يتم إنجازه للعميل',
        purchaseTip: 'تسجيل مصاريف الأدوات والمستلزمات بحرية',
        categorySuggestions: ['صيانة', 'تركيب', 'استشارات', 'تصميم', 'نقل', 'تنظيف'],
        rawMaterialCategories: ['أدوات', 'قطع غيار', 'مستلزمات', 'نقل', 'متنوع']
    },
    wholesale: {
        label: 'توزيع وتجارة جملة',
        icon: 'fa-truck-fast',
        unitLabel: 'كرتون',
        units: ['كرتون', 'شوال', 'صندوق', 'طن', 'برميل', 'قطعة'],
        hasPriceTiers: true,
        hasBarcode: true,
        hasStock: true,
        purchaseByUnit: true,
        freePurchase: false,
        saleTip: 'بيع بالكميات الكبيرة للتجار والمحلات',
        purchaseTip: 'استيراد أو شراء من المصنع أو المستودع وتحديث المخزون',
        categorySuggestions: ['مواد غذائية', 'مستلزمات منزلية', 'مواد بناء', 'أدوات', 'عام'],
        rawMaterialCategories: []
    },
    production: {
        label: 'تصنيع وإنتاج',
        icon: 'fa-industry',
        unitLabel: 'وحدة',
        units: ['وحدة', 'كيلو', 'طن', 'لتر', 'متر', 'قطعة'],
        hasPriceTiers: false,
        hasBarcode: true,
        hasStock: true,
        purchaseByUnit: false,
        freePurchase: true,   // ✅ مشتريات حرة (مواد أولية)
        saleTip: 'بيع المنتجات المصنّعة للتجار أو المستهلكين',
        purchaseTip: 'تسجيل تكلفة المواد الأولية الخام بحرية دون ربط بمخزون المنتج النهائي',
        categorySuggestions: ['منتجات تامة', 'شبه مصنّعة'],
        rawMaterialCategories: ['مواد أولية', 'مواد تعبئة', 'طاقة/وقود', 'كيماويات', 'متنوع']
    },
    other: {
        label: 'أخرى / مخصص',
        icon: 'fa-briefcase',
        unitLabel: 'وحدة',
        units: ['وحدة', 'قطعة', 'كيلو', 'لتر', 'ساعة', 'خدمة', 'كرتون', 'متر'],
        hasPriceTiers: true,
        hasBarcode: false,
        hasStock: true,
        purchaseByUnit: true,
        freePurchase: false,
        saleTip: 'نوع مخصص حسب طبيعة نشاطك',
        purchaseTip: 'مشتريات حسب طبيعة نشاطك',
        categorySuggestions: ['عام', 'متنوع'],
        rawMaterialCategories: ['متنوع']
    }
};

// مساعد: الحصول على إعدادات نوع نشاط مشروع معين
function getProjectBusinessType(projId) {
    const proj = AppState.projects.find(p => p.id === projId);
    if (!proj || !proj.businessType) return BUSINESS_TYPES.other;
    return BUSINESS_TYPES[proj.businessType] || BUSINESS_TYPES.other;
}

// مساعد: الحصول على وحدة قياس منتج معين (أو وحدة المشروع الافتراضية)
function getProductUnit(prod, projId) {
    if (prod && prod.unit) return prod.unit;
    const bt = getProjectBusinessType(projId);
    return bt.unitLabel;
}

// إعدادات Firebase الخاصة بالمشروع
const firebaseConfig = {
    apiKey: "AIzaSyBc3Mc_lL8xTrjiXrxgwBpIOSx6vT77WC0",
    authDomain: "progict-6f62c.firebaseapp.com",
    projectId: "progict-6f62c",
    storageBucket: "progict-6f62c.firebasestorage.app",
    messagingSenderId: "1071242778985",
    appId: "1:1071242778985:web:d0882800e17f89e4ac05f8",
    measurementId: "G-FYPYJY53VS"
};

// هيكل البيانات الأساسي بدون أي أرقام وهمية - تُجلب الأرقام الحقيقية فورياً من Firebase
const AppState = {
    currentProject: 'all', // 'all' أو رمز أي مشروع
    projects: [
        { id: 'proj_01', name: 'المشروع 1 (الإلكترونيات والتقنية)', code: 'ELEC', currency: 'ILS', description: 'تجارة وتوزيع الأجهزة الإلكترونية', businessType: 'retail' },
        { id: 'proj_02', name: 'المشروع 2 (الأزياء والإكسسوارات)', code: 'ACC', currency: 'ILS', description: 'تجارة الأزياء والحقائب', businessType: 'retail' }
    ],
    // الحسابات المالية المشتركة الأربعة (أرصدتها تبدأ بـ 0 وتُستدعى من قاعدة البيانات)
    accounts: [
        {
            id: 'acc_bank',
            type: 'bank',
            name: 'بنك فلسطين - الحساب الموحد',
            accountNumber: '450982-01',
            balance: 0.00,
            isPrimary: true, // الحساب الأولي الافتراضي
            allocations: { proj_01: 0.00, proj_02: 0.00 }
        },
        {
            id: 'acc_wallet',
            type: 'wallet',
            name: 'محفظة بال باي الإلكترونية (PalPay)',
            accountNumber: 'PAL-998822',
            balance: 0.00,
            isPrimary: false,
            allocations: { proj_01: 0.00, proj_02: 0.00 }
        },
        {
            id: 'acc_jawwal',
            type: 'jawwal',
            name: 'حساب جوال باي المعتمد (Jawwal Pay)',
            accountNumber: '0599888999',
            balance: 0.00,
            isPrimary: false,
            allocations: { proj_01: 0.00, proj_02: 0.00 }
        },
        {
            id: 'acc_cash',
            type: 'cash',
            name: 'الخزينة النقدية (الكاش المباشر)',
            accountNumber: 'CASH-MAIN',
            balance: 0.00,
            isPrimary: false,
            allocations: { proj_01: 0.00, proj_02: 0.00 }
        }
    ],
    products: [],
    customers: [],
    suppliers: [],
    salesInvoices: [],
    purchaseInvoices: [],
    transfers: [],
    journalEntries: [],
    systemUsers: [] // قائمة موظفي النظام والصلاحيات
};

// المحرك الرئيسي للنظام
const App = {
    db: null,
    auth: null,
    currentUser: null, // { uid, email, username, name, role: 'admin'|'employee', assignedProject, permissions }
    activeLoginTab: 'admin',
    isCloudSynced: false,
    snapshotUnsubscribe: null,
    usersUnsubscribe: null,
    comparisonChart: null,
    paymentsChart: null,
    saleItems: [],
    paymentRows: [],
    editingSaleId: null,
    editingPurchaseId: null,

    init() {
        this.setupEventListeners();
        this.setupOfflineListener();
        this.initFirebase();
        this.initAuth();
    },

    setupOfflineListener() {
        window.addEventListener('online', () => this.handleNetworkStatus(true));
        window.addEventListener('offline', () => this.handleNetworkStatus(false));
        this.handleNetworkStatus(navigator.onLine);
    },

    handleNetworkStatus(isOnline) {
        const banner = document.getElementById('offlineNoticeBanner');
        const statusText = document.getElementById('cloudStatusText');
        const pill = document.getElementById('cloudStatusPill');

        if (!isOnline) {
            if (banner) banner.style.display = 'block';
            if (statusText) statusText.innerText = 'انقطع الاتصال بالإنترنت (الكتابة معطلة)';
            if (pill) {
                pill.style.background = '#fee2e2';
                pill.style.color = '#dc2626';
                pill.style.borderColor = '#fca5a5';
            }
        } else {
            if (banner) banner.style.display = 'none';
            if (statusText) statusText.innerText = this.isCloudSynced ? 'متصل بالسحابة (Firebase Live)' : 'متصل بالإنترنت';
            if (pill) {
                pill.style.background = '';
                pill.style.color = '';
                pill.style.borderColor = '';
            }
        }
    },

    /* ========================================================
       الاتصال بـ Firebase (بدون جلب البيانات إلا بعد تسجيل الدخول)
       ======================================================== */
    initFirebase() {
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                this.db = firebase.firestore();
                if (firebase.auth) {
                    this.auth = firebase.auth();
                }
            }
        } catch (e) {
            console.warn('تعذر تهيئة Firebase:', e);
        }
    },

    /* ========================================================
       جلب ومزامنة البيانات السحابية (تُستدعى فقط بعد نجاح تسجيل الدخول)
       ======================================================== */
    startCloudSync() {
        if (!this.db || !this.currentUser) return;
        if (!navigator.onLine) {
            this.handleNetworkStatus(false);
            return;
        }

        const statusText = document.getElementById('cloudStatusText');
        if (statusText) statusText.innerText = 'جاري مزامنة السجلات من السحابة...';

        // إلغاء أي اشتراك قديم
        if (this.snapshotUnsubscribe) {
            this.snapshotUnsubscribe();
            this.snapshotUnsubscribe = null;
        }

        // الاستماع اللحظي لسجلات النظام فقط بعد تسجيل الدخول
        this.snapshotUnsubscribe = this.db.collection('erp_data').doc('master_state').onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data && data.accounts) {
                    delete data.customers;
                    Object.assign(AppState, data);
                    if (Array.isArray(AppState.suppliers)) {
                        AppState.suppliers = AppState.suppliers.filter(s => s && s.id !== 's_default');
                    }
                    if (!Array.isArray(AppState.systemUsers)) {
                        AppState.systemUsers = [];
                    }
                    this.isCloudSynced = true;
                    if (statusText) statusText.innerText = 'متصل بالسحابة (Firebase Live)';
                    this.renderAll();
                }
            } else {
                if (this.currentUser && this.currentUser.role === 'admin') {
                    this.saveState();
                    if (statusText) statusText.innerText = 'متصل بالسحابة (تمت التهيئة)';
                }
            }
        }, (error) => {
            console.warn('Firebase sync error:', error);
            if (statusText) statusText.innerText = 'العمل في وضع التخزين المحلي';
        });

        // مزامنة مستخدمي النظام أيضاً
        if (this.usersUnsubscribe) {
            this.usersUnsubscribe();
            this.usersUnsubscribe = null;
        }
        this.usersUnsubscribe = this.db.collection('erp_data').doc('system_users').onSnapshot((uDoc) => {
            if (uDoc.exists) {
                const uData = uDoc.data();
                if (uData && Array.isArray(uData.users)) {
                    AppState.systemUsers = uData.users;
                    if (this.currentUser && this.currentUser.role === 'admin') {
                        this.renderUsers();
                    }
                }
            }
        }, (err) => console.warn('Users sync err:', err));
    },

    saveState() {
        // 1. منع الكتابة نهائياً عند انقطاع الإنترنت لحماية قاعدة البيانات السحابية من التضارب
        if (!navigator.onLine) {
            alert('⚠️ تنبيه أمني: أنت غير متصل بالإنترنت حالياً!\nتم منع أي عملية حفظ أو تعديل تلقائياً لحماية قاعدة البيانات السحابية من التضارب.');
            return false;
        }

        // 2. التحقق من صلاحية المستخدم
        if (!this.currentUser) {
            alert('⚠️ غير مصرح لك بإجراء أي تعديل دون تسجيل الدخول.');
            return false;
        }

        // 3. الحفظ في الذاكرة المحلية كنسخة احتياطية
        try {
            localStorage.setItem('ERP_CLEAN_DATA_V2', JSON.stringify(AppState));
        } catch (e) {
            console.error('LocalStorage write error:', e);
        }

        // 4. الحفظ في Firebase Firestore
        if (this.db) {
            const cloudPayload = { ...AppState };
            delete cloudPayload.customers;

            this.db.collection('erp_data').doc('master_state').set(cloudPayload).then(() => {
                const statusText = document.getElementById('cloudStatusText');
                if (statusText) statusText.innerText = 'متصل بالسحابة (تم الحفظ فورياً)';
            }).catch(err => {
                console.warn('فشل الحفظ في Firebase:', err);
            });
        }
        return true;
    },

    loadLocalCache() {
        const saved = localStorage.getItem('ERP_CLEAN_DATA_V2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.assign(AppState, parsed);
                if (Array.isArray(AppState.customers)) {
                    AppState.customers = AppState.customers.filter(c => c && c.id !== 'c_default');
                }
                if (Array.isArray(AppState.suppliers)) {
                    AppState.suppliers = AppState.suppliers.filter(s => s && s.id !== 's_default');
                }
                if (!Array.isArray(AppState.systemUsers)) {
                    AppState.systemUsers = [];
                }
            } catch (e) {
                console.error(e);
            }
        }
    },

    /* ========================================================
       نظام تسجيل الدخول والصلاحيات (Authentication & Permissions)
       ======================================================== */
    initAuth() {
        // ✅ لا استعادة جلسة عند إعادة التحميل — الرجوع دائماً لشاشة تسجيل الدخول
        localStorage.removeItem('ERP_CURRENT_USER');
        this.currentUser = null;

        if (typeof firebase !== 'undefined' && firebase.auth) {
            this.auth = firebase.auth();
            try {
                this.auth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
            } catch(e) {}
            this.auth.signOut().catch(() => {});
        }

        this.showLoginScreen();
    },

    setLoggedInUser(user) {
        this.currentUser = user;
        // ✅ لا نحفظ جلسة الموظف في localStorage — إعادة التحميل تعيد لشاشة الدخول
        // المدير فقط يعيد دخوله تلقائياً عبر Firebase Auth token
        // try { localStorage.setItem('ERP_CURRENT_USER', JSON.stringify(user)); } catch(e) {}

        this.hideLoginScreen();
        // إظهار واجهة التطبيق فقط بعد نجاح تسجيل الدخول
        const appContainer = document.getElementById('appContainer');
        if (appContainer) appContainer.style.display = 'flex';

        // الآن فقط يتم جلب البيانات ومزامنة السحابة
        this.loadLocalCache();
        this.startCloudSync();
        this.applyUserPermissions();
        this.renderAll();
    },

    showLoginScreen() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
        // إخفاء حاوية التطبيق نهائياً لمنع أي تسريب لأرقام أو بيانات حساسة
        const appContainer = document.getElementById('appContainer');
        if (appContainer) appContainer.style.display = 'none';
    },

    hideLoginScreen() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    switchLoginTab(tab) {
        this.activeLoginTab = tab;
        const btnAdmin = document.getElementById('tabBtnAdmin');
        const btnEmp = document.getElementById('tabBtnEmployee');
        const formAdmin = document.getElementById('adminLoginForm');
        const formEmp = document.getElementById('employeeLoginForm');

        if (tab === 'admin') {
            if (btnAdmin) btnAdmin.classList.add('active');
            if (btnEmp) btnEmp.classList.remove('active');
            if (formAdmin) formAdmin.style.display = 'block';
            if (formEmp) formEmp.style.display = 'none';
        } else {
            if (btnAdmin) btnAdmin.classList.remove('active');
            if (btnEmp) btnEmp.classList.add('active');
            if (formAdmin) formAdmin.style.display = 'none';
            if (formEmp) formEmp.style.display = 'block';
        }
    },

    submitAdminLogin(e) {
        if (e) e.preventDefault();
        if (!navigator.onLine) {
            this.showLoginAlert('admin', '⚠️ لا يمكن تسجيل الدخول أثناء انقطاع الإنترنت! يرجى الاتصال بالشبكة.', 'danger');
            return;
        }

        const email = document.getElementById('adminEmailInput')?.value.trim();
        const pass = document.getElementById('adminPassInput')?.value;
        const alertBox = document.getElementById('adminLoginAlert');
        const submitBtn = document.getElementById('adminLoginSubmitBtn');

        if (!email || !pass) {
            this.showLoginAlert('admin', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور', 'danger');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
        }

        if (!this.auth && typeof firebase !== 'undefined' && firebase.auth) {
            this.auth = firebase.auth();
        }

        if (!this.auth) {
            this.showLoginAlert('admin', 'خدمة Firebase Auth غير متوفرة حالياً، تأكد من الاتصال بالإنترنت.', 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول كمدير';
            }
            return;
        }

        // تسجيل الدخول فقط (يمنع نهائياً أي إنشاء حساب في Firebase من داخل النظام)
        this.auth.signInWithEmailAndPassword(email, pass).then((res) => {
            const fbUser = res.user;
            const adminUser = {
                uid: fbUser.uid,
                email: fbUser.email,
                username: fbUser.email,
                name: fbUser.displayName || 'المدير العام',
                role: 'admin',
                assignedProject: 'all',
                permissions: {
                    canViewSales: true,
                    canViewPurchases: true,
                    canViewAccountsOnly: false,
                    canManageInventory: true,
                    canManageSuppliers: true,
                    canManageCustomers: true,
                    canViewAllProjects: true,
                    isSuperAdmin: true
                }
            };
            this.setLoggedInUser(adminUser);
            if (alertBox) alertBox.style.display = 'none';
        }).catch((err) => {
            let msg = 'خطأ أثناء تسجيل الدخول: ' + (err.message || '');
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            } else if (err.code === 'auth/weak-password') {
                msg = 'كلمة المرور ضعيفة.';
            } else if (err.code === 'auth/invalid-email') {
                msg = 'صيغة البريد الإلكتروني غير صحيحة.';
            }
            this.showLoginAlert('admin', msg, 'danger');
        }).finally(() => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول كمدير';
            }
        });
    },

    async submitEmployeeLogin(e) {
        if (e) e.preventDefault();
        if (!navigator.onLine) {
            this.showLoginAlert('employee', '⚠️ لا يمكن تسجيل الدخول أثناء انقطاع الإنترنت! يرجى الاتصال بالشبكة.', 'danger');
            return;
        }

        const username = document.getElementById('empUsernameInput')?.value.trim();
        const pass = document.getElementById('empPassInput')?.value;
        const submitBtn = document.getElementById('empLoginSubmitBtn');

        if (!username || !pass) {
            this.showLoginAlert('employee', 'الرجاء إدخال اسم المستخدم وكلمة المرور', 'danger');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
        }

        try {
            let users = AppState.systemUsers || [];
            // جلب قائمة المستخدمين فقط للتحقق دون جلب البيانات المالية
            if (this.db) {
                const uDoc = await this.db.collection('erp_data').doc('system_users').get();
                if (uDoc.exists && Array.isArray(uDoc.data().users)) {
                    users = uDoc.data().users;
                    AppState.systemUsers = users;
                } else {
                    const mDoc = await this.db.collection('erp_data').doc('master_state').get();
                    if (mDoc.exists && Array.isArray(mDoc.data().systemUsers)) {
                        users = mDoc.data().systemUsers;
                        AppState.systemUsers = users;
                    }
                }
            }

            const emp = users.find(u => (u.username || '').toLowerCase() === username.toLowerCase());

            if (!emp) {
                this.showLoginAlert('employee', 'اسم المستخدم هذا غير مسجل في النظام. تواصل مع المدير العام لإنشاء حسابك.', 'danger');
                return;
            }

            if (emp.password !== pass) {
                this.showLoginAlert('employee', 'كلمة المرور غير صحيحة!', 'danger');
                return;
            }

            const sessionUser = {
                id: emp.id,
                name: emp.name || emp.username,
                username: emp.username,
                role: 'employee',
                assignedProject: emp.assignedProject || (AppState.projects[0]?.id || 'proj_01'),
                permissions: {
                    canViewSales: !!emp.permissions?.canViewSales,
                    canViewPurchases: !!emp.permissions?.canViewPurchases,
                    canViewAccountsOnly: !!emp.permissions?.canViewAccountsOnly,
                    canManageInventory: !!emp.permissions?.canManageInventory,
                    canManageSuppliers: !!emp.permissions?.canManageSuppliers,
                    canManageCustomers: !!emp.permissions?.canManageCustomers,
                    canViewAllProjects: !!emp.permissions?.canViewAllProjects,
                    isSuperAdmin: false
                }
            };

            this.setLoggedInUser(sessionUser);
        } catch (err) {
            console.error('Login error:', err);
            this.showLoginAlert('employee', 'حدث خطأ في الاتصال بقاعدة البيانات: ' + (err.message || ''), 'danger');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> دخول إلى حساب الموظف';
            }
        }
    },

    showLoginAlert(tab, msg, type = 'danger') {
        const el = document.getElementById(tab === 'admin' ? 'adminLoginAlert' : 'empLoginAlert');
        if (!el) return;
        el.style.display = 'block';
        el.className = type === 'danger' ? 'badge badge-red' : 'badge badge-green';
        el.style.padding = '8px 12px';
        el.style.borderRadius = '6px';
        el.style.width = '100%';
        el.style.textAlign = 'right';
        el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    },

    logout() {
        if (!confirm('هل تريد بالتأكيد تسجيل الخروج من النظام؟')) return;

        // إيقاف أي اشتراك سحابي فوري
        if (this.snapshotUnsubscribe) {
            this.snapshotUnsubscribe();
            this.snapshotUnsubscribe = null;
        }
        if (this.usersUnsubscribe) {
            this.usersUnsubscribe();
            this.usersUnsubscribe = null;
        }

        if (this.currentUser?.role === 'admin' && this.auth) {
            this.auth.signOut().catch(console.error);
        }
        localStorage.removeItem('ERP_CURRENT_USER');
        this.currentUser = null;

        // تفريغ كافة البيانات الحساسة من الذاكرة ومن الواجهة
        AppState.salesInvoices = [];
        AppState.purchaseInvoices = [];
        AppState.products = [];
        AppState.transfers = [];
        AppState.journalEntries = [];
        AppState.customers = [];
        AppState.suppliers = [];
        AppState.systemUsers = [];
        if (Array.isArray(AppState.accounts)) {
            AppState.accounts.forEach(a => { a.balance = 0; a.allocations = {}; });
        }

        // مسح الجداول وتصفير الأرقام بالكامل
        const emptyMsg = '<tr><td colspan="10" class="text-center py-4 text-muted">تسجيل الدخول مطلوب</td></tr>';
        ['salesTableBody', 'purchasesTableBody', 'productsTableBody', 'dashRecentSalesBody', 'usersTableBody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = emptyMsg;
        });
        ['dashTotalSales', 'dashNetProfit', 'dashInventoryVal', 'dashTotalLiquidity'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '0.00 ₪';
        });

        // مسح حقول الدخول
        const adminEmail = document.getElementById('adminEmailInput');
        const adminPass = document.getElementById('adminPassInput');
        const empUser = document.getElementById('empUsernameInput');
        const empPass = document.getElementById('empPassInput');
        if (adminEmail) adminEmail.value = '';
        if (adminPass) adminPass.value = '';
        if (empUser) empUser.value = '';
        if (empPass) empPass.value = '';

        this.showLoginScreen();
    },

    applyUserPermissions() {
        const user = this.currentUser;
        if (!user) return;

        // 1. تحديث معلومات المستخدم في أسفل القائمة الجانبية
        const nameEl = document.getElementById('sidebarUserName');
        const roleEl = document.getElementById('sidebarUserRole');
        if (nameEl) nameEl.innerText = user.name || user.username || 'مستخدم';
        if (roleEl) {
            if (user.role === 'admin') {
                roleEl.innerHTML = '<span class="badge badge-green" style="font-size:0.65rem; padding:1px 5px;"><i class="fa-solid fa-crown"></i> المدير العام (كامل الصلاحيات)</span>';
            } else {
                const pName = this.getProjectName(user.assignedProject);
                roleEl.innerHTML = `<span class="badge badge-blue" style="font-size:0.65rem; padding:1px 5px;"><i class="fa-solid fa-user"></i> موظف: ${pName}</span>`;
            }
        }

        const isAdmin = user.role === 'admin' || user.permissions?.isSuperAdmin;
        const perms = user.permissions || {};

        // 2. إظهار/إخفاء عناصر القائمة الجانبية بناءً على الصلاحيات المطلوبة
        this.toggleElementDisplay('[data-page="projects"]', isAdmin || perms.canViewAllProjects);
        this.toggleElementDisplay('[data-page="sales"]', isAdmin || perms.canViewSales);
        this.toggleElementDisplay('[data-page="purchases"]', isAdmin || perms.canViewPurchases);
        this.toggleElementDisplay('[data-page="inventory"]', isAdmin || perms.canManageInventory || perms.canViewSales);
        this.toggleElementDisplay('[data-page="accounts"]', isAdmin || perms.canViewAccountsOnly);
        this.toggleElementDisplay('[data-page="transfers"]', isAdmin);
        this.toggleElementDisplay('[data-page="customers"]', isAdmin || perms.canManageCustomers);
        this.toggleElementDisplay('[data-page="suppliers"]', isAdmin || perms.canManageSuppliers);
        this.toggleElementDisplay('[data-page="accounting"]', isAdmin);
        this.toggleElementDisplay('[data-page="reports"]', isAdmin || perms.canViewAllProjects);
        this.toggleElementDisplay('#menuLabelAdmin', isAdmin);
        this.toggleElementDisplay('#menuItemUsers', isAdmin);

        // 3. أزرار الشريط العلوي
        this.toggleElementDisplay('#liquidityQuickBtn', isAdmin);
        this.toggleElementDisplay('header.topbar button[onclick="App.openSaleModal()"]', isAdmin || perms.canViewSales);

        // 4. تقييد نطاق العمل بالمشروع المخصص (يتم تعيين الموظف حسب مشروعه فقط)
        const scopeSelect = document.getElementById('projectSelectScope');
        if (scopeSelect) {
            if (!isAdmin && !perms.canViewAllProjects) {
                // تقييد إجباري بمشروع الموظف فقط
                AppState.currentProject = user.assignedProject;
                scopeSelect.disabled = true;
                scopeSelect.innerHTML = `<option value="${user.assignedProject}">🏢 ${this.getProjectName(user.assignedProject)} (مشروعك المخصص)</option>`;
                scopeSelect.value = user.assignedProject;
            } else {
                scopeSelect.disabled = false;
                this.updateProjectDropdowns();
            }
        }

        // 5. ضبط أزرار الإجراءات داخل الصفحات
        if (!isAdmin && perms.canViewAccountsOnly) {
            document.querySelectorAll('#accountsCardsList .btn, #accountsCardsList button').forEach(b => {
                b.style.display = 'none';
            });
        }
        if (!isAdmin && !perms.canManageInventory) {
            this.toggleElementDisplay('#page-inventory button[onclick="App.openProductModal()"]', false);
            this.toggleElementDisplay('#page-inventory button[onclick="App.openInventoryScanModal()"]', false);
        }
        if (!isAdmin && !perms.canManageSuppliers) {
            this.toggleElementDisplay('#page-suppliers button[onclick="App.openSupplierModal()"]', false);
        }
        if (!isAdmin && !perms.canManageCustomers) {
            this.toggleElementDisplay('#page-customers button[onclick="App.openCustomerModal()"]', false);
        }
    },

    checkPermission(permKey) {
        if (!this.currentUser) return false;
        if (this.currentUser.role === 'admin' || this.currentUser.permissions?.isSuperAdmin) return true;
        return !!(this.currentUser.permissions && this.currentUser.permissions[permKey]);
    },

    toggleElementDisplay(selector, show) {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
            el.style.display = show ? '' : 'none';
        });
    },

    /* ========================================================
       إدارة الموظفين والصلاحيات (Admin User Management)
       ======================================================== */
    renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        const badge = document.getElementById('usersCountBadge');
        if (!tbody) return;

        const users = AppState.systemUsers || [];
        if (badge) badge.innerText = `${users.length} موظف`;

        if (!users.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">لا يوجد موظفون مضافون بعد. اضغط "إضافة موظف جديد" لإنشاء أول موظف وتحديد صلاحياته.</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const p = u.permissions || {};
            const badgesHtml = [
                p.canViewSales ? '<span class="badge badge-blue"><i class="fa-solid fa-cart-shopping"></i> المبيعات</span>' : '',
                p.canViewPurchases ? '<span class="badge badge-green"><i class="fa-solid fa-truck-ramp-box"></i> المشتريات</span>' : '',
                p.canViewAccountsOnly ? '<span class="badge badge-teal"><i class="fa-solid fa-building-columns"></i> مشاهدة الحسابات فقط</span>' : '',
                p.canManageInventory ? '<span class="badge badge-amber"><i class="fa-solid fa-boxes-stacked"></i> إدخال أصناف</span>' : '',
                p.canManageSuppliers ? '<span class="badge" style="background:#f1f5f9; color:#475569;"><i class="fa-solid fa-truck-field"></i> إدخال موردين</span>' : '',
                p.canManageCustomers ? '<span class="badge badge-blue"><i class="fa-solid fa-users"></i> إدخال عملاء</span>' : '',
                p.canViewAllProjects ? '<span class="badge badge-red"><i class="fa-solid fa-globe"></i> كل المشاريع</span>' : '<span class="badge badge-teal"><i class="fa-solid fa-lock"></i> مشروع محدد</span>'
            ].filter(Boolean).join(' ') || '<span class="text-muted">بدون صلاحيات</span>';

            const projName = this.getProjectName(u.assignedProject);

            return `
                <tr>
                    <td><strong>${u.name || u.username}</strong></td>
                    <td><code style="background:var(--bg-subtle); padding:2px 6px; border-radius:4px; font-weight:700;">${u.username}</code></td>
                    <td><span class="badge badge-blue"><i class="fa-solid fa-briefcase"></i> ${projName}</span></td>
                    <td style="max-width:320px; line-height:1.6;">${badgesHtml}</td>
                    <td><small class="text-muted">${u.createdAt || '—'}</small></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline" onclick="App.openEditUserModal('${u.id}')" title="تعديل الموظف"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteSystemUser('${u.id}')" title="حذف الموظف"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    openAddUserModal() {
        document.getElementById('editingUserId').value = '';
        document.getElementById('userModalTitle').innerHTML = '<i class="fa-solid fa-user-plus text-primary"></i> إضافة موظف جديد وصلاحيات';
        document.getElementById('userFullName').value = '';
        document.getElementById('userUsername').value = '';
        document.getElementById('userPassword').value = '';

        const projSel = document.getElementById('userAssignedProject');
        if (projSel) {
            projSel.innerHTML = AppState.projects.map(p => `<option value="${p.id}">🏢 ${p.name}</option>`).join('');
        }

        // القيم الافتراضية للصلاحيات
        document.getElementById('perm_canViewSales').checked = true;
        document.getElementById('perm_canViewPurchases').checked = false;
        document.getElementById('perm_canViewAccountsOnly').checked = false;
        document.getElementById('perm_canManageInventory').checked = false;
        document.getElementById('perm_canManageSuppliers').checked = false;
        document.getElementById('perm_canManageCustomers').checked = false;
        document.getElementById('perm_canViewAllProjects').checked = false;

        this.openModal('userModal');
    },

    openEditUserModal(userId) {
        const u = (AppState.systemUsers || []).find(x => x.id === userId);
        if (!u) return;

        document.getElementById('editingUserId').value = u.id;
        document.getElementById('userModalTitle').innerHTML = `<i class="fa-solid fa-user-pen text-primary"></i> تعديل بيانات الموظف (${u.name || u.username})`;
        document.getElementById('userFullName').value = u.name || '';
        document.getElementById('userUsername').value = u.username || '';
        document.getElementById('userPassword').value = u.password || '';

        const projSel = document.getElementById('userAssignedProject');
        if (projSel) {
            projSel.innerHTML = AppState.projects.map(p => `<option value="${p.id}" ${p.id === u.assignedProject ? 'selected' : ''}>🏢 ${p.name}</option>`).join('');
        }

        const p = u.permissions || {};
        document.getElementById('perm_canViewSales').checked = !!p.canViewSales;
        document.getElementById('perm_canViewPurchases').checked = !!p.canViewPurchases;
        document.getElementById('perm_canViewAccountsOnly').checked = !!p.canViewAccountsOnly;
        document.getElementById('perm_canManageInventory').checked = !!p.canManageInventory;
        document.getElementById('perm_canManageSuppliers').checked = !!p.canManageSuppliers;
        document.getElementById('perm_canManageCustomers').checked = !!p.canManageCustomers;
        document.getElementById('perm_canViewAllProjects').checked = !!p.canViewAllProjects;

        this.openModal('userModal');
    },

    saveSystemUser() {
        if (!navigator.onLine) {
            alert('⚠️ لا يمكن حفظ بيانات الموظف أثناء انقطاع الإنترنت!');
            return;
        }
        if (this.currentUser?.role !== 'admin') {
            alert('⚠️ إدارة الموظفين وصلاحياتهم مخصصة للمدير العام فقط!');
            return;
        }

        const id = document.getElementById('editingUserId').value;
        const name = document.getElementById('userFullName').value.trim();
        const username = document.getElementById('userUsername').value.trim();
        const password = document.getElementById('userPassword').value.trim();
        const assignedProj = document.getElementById('userAssignedProject').value;

        if (!name || !username || !password) {
            alert('الرجاء تعبئة الاسم واسم المستخدم وكلمة المرور.');
            return;
        }

        if (!AppState.systemUsers) AppState.systemUsers = [];

        // التأكد من عدم تكرار اسم المستخدم
        const exists = AppState.systemUsers.some(u => (u.username || '').toLowerCase() === username.toLowerCase() && u.id !== id);
        if (exists) {
            alert('اسم المستخدم هذا مستخدم مسبقاً! الرجاء اختيار اسم آخر.');
            return;
        }

        const permissions = {
            canViewSales: document.getElementById('perm_canViewSales').checked,
            canViewPurchases: document.getElementById('perm_canViewPurchases').checked,
            canViewAccountsOnly: document.getElementById('perm_canViewAccountsOnly').checked,
            canManageInventory: document.getElementById('perm_canManageInventory').checked,
            canManageSuppliers: document.getElementById('perm_canManageSuppliers').checked,
            canManageCustomers: document.getElementById('perm_canManageCustomers').checked,
            canViewAllProjects: document.getElementById('perm_canViewAllProjects').checked
        };

        const now = new Date().toISOString().slice(0, 10);

        if (id) {
            const idx = AppState.systemUsers.findIndex(u => u.id === id);
            if (idx !== -1) {
                AppState.systemUsers[idx] = {
                    ...AppState.systemUsers[idx],
                    name,
                    username,
                    password,
                    assignedProject: assignedProj,
                    permissions
                };
            }
        } else {
            AppState.systemUsers.push({
                id: 'emp_' + Date.now(),
                name,
                username,
                password,
                assignedProject: assignedProj,
                permissions,
                createdAt: now
            });
        }

        if (this.db) {
            this.db.collection('erp_data').doc('system_users').set({ users: AppState.systemUsers }).catch(console.error);
        }

        this.saveState();
        this.closeModal('userModal');
        this.renderUsers();
        alert('تم حفظ بيانات الموظف وتحديث الصلاحيات بنجاح!');
    },

    deleteSystemUser(userId) {
        if (!navigator.onLine) {
            alert('⚠️ لا يمكن حذف حسابات الموظفين أثناء انقطاع الإنترنت!');
            return;
        }
        if (this.currentUser?.role !== 'admin') {
            alert('⚠️ حذف الموظفين مخصص للمدير العام فقط!');
            return;
        }

        const u = (AppState.systemUsers || []).find(x => x.id === userId);
        if (!u) return;

        if (!confirm(`هل أنت متأكد من حذف حساب الموظف (${u.name || u.username})؟ لن يتمكن من تسجيل الدخول بعد الآن.`)) return;

        AppState.systemUsers = AppState.systemUsers.filter(x => x.id !== userId);

        if (this.db) {
            this.db.collection('erp_data').doc('system_users').set({ users: AppState.systemUsers }).catch(console.error);
        }

        this.saveState();
        this.renderUsers();
        alert('تم حذف حساب الموظف بنجاح.');
    },

    /* ========================================================
       الأحداث والتنقل والتبديل
       ======================================================== */
    setupEventListeners() {
        // التنقل بين الصفحات
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                if (page) this.navigateTo(page);
            });
        });

        // محدد نطاق العمل (المشروع 1، المشروع 2، أو الإدارة الموحدة)
        const scopeSelect = document.getElementById('projectSelectScope');
        if (scopeSelect) {
            scopeSelect.value = AppState.currentProject;
            scopeSelect.addEventListener('change', (e) => {
                AppState.currentProject = e.target.value;
                this.renderAll();
            });
        }

        // تبديل المظهر الليلي
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const isDark = document.body.classList.toggle('dark');
                localStorage.setItem('ERP_THEME', isDark ? 'dark' : 'light');
                themeBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
                this.renderCharts();
            });
            if (localStorage.getItem('ERP_THEME') === 'dark') {
                document.body.classList.add('dark');
                themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        }

        // شريط الموبايل الجانبي والتعتيم
        const sidebarToggle = document.getElementById('sidebarToggleBtn');
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');

        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', () => {
                const isOpen = sidebar.classList.toggle('open');
                if (backdrop) backdrop.classList.toggle('active', isOpen);
            });
        }

        if (backdrop && sidebar) {
            backdrop.addEventListener('click', () => {
                sidebar.classList.remove('open');
                backdrop.classList.remove('active');
            });
        }

        // البحث في الأصناف
        const prodSearch = document.getElementById('prodSearchInput');
        if (prodSearch) {
            prodSearch.addEventListener('input', (e) => this.renderInventory(e.target.value));
        }
    },

    navigateTo(pageName) {
        // فحص صلاحيات المستخدم الحالي قبل السماح بالدخول
        if (this.currentUser && this.currentUser.role !== 'admin' && !this.currentUser.permissions?.isSuperAdmin) {
            const p = this.currentUser.permissions || {};
            if (pageName === 'sales' && !p.canViewSales) {
                alert('عذراً، ليس لديك صلاحية لمشاهدة قسم المبيعات.');
                return;
            }
            if (pageName === 'purchases' && !p.canViewPurchases) {
                alert('عذراً، ليس لديك صلاحية لمشاهدة قسم المشتريات والتوريد.');
                return;
            }
            if (pageName === 'accounts' && !p.canViewAccountsOnly) {
                alert('عذراً، ليس لديك صلاحية للاطلاع على الحسابات البنكية.');
                return;
            }
            if (pageName === 'customers' && !p.canManageCustomers) {
                alert('عذراً، ليس لديك صلاحية لإدارة العملاء والذمم.');
                return;
            }
            if (pageName === 'suppliers' && !p.canManageSuppliers) {
                alert('عذراً، ليس لديك صلاحية لإدارة الموردين.');
                return;
            }
            if (pageName === 'inventory' && !p.canManageInventory && !p.canViewSales) {
                alert('عذراً، ليس لديك صلاحية لدخول قسم المخزون.');
                return;
            }
            if (pageName === 'projects' && !p.canViewAllProjects) {
                alert('تم تعيين حسابك لمشروعك المخصص فقط، ولا يمكنك التنقل بين المشاريع.');
                return;
            }
            if (['transfers', 'accounting', 'users'].includes(pageName)) {
                alert('هذا القسم مخصص للمدير العام فقط.');
                return;
            }
        }

        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-page') === pageName);
        });

        document.querySelectorAll('.page-view').forEach(view => {
            view.classList.toggle('active', view.id === `page-${pageName}`);
        });

        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (sidebar && window.innerWidth <= 992) {
            sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('active');
        }

        if (pageName === 'dashboard') this.renderDashboard();
        if (pageName === 'projects') this.renderProjects();
        if (pageName === 'sales') this.renderSales();
        if (pageName === 'purchases') this.renderPurchases();
        if (pageName === 'inventory') this.renderInventory();
        if (pageName === 'accounts') this.renderAccounts();
        if (pageName === 'transfers') this.renderTransfers();
        if (pageName === 'customers') this.renderCustomers();
        if (pageName === 'suppliers') this.renderSuppliers();
        if (pageName === 'accounting') this.renderAccounting();
        if (pageName === 'reports') this.generateReport();
        if (pageName === 'users') this.renderUsers();
    },

    filterProject(list, prop = 'projectId') {
        if (!Array.isArray(list)) return [];
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const target = isEmployee ? user.assignedProject : AppState.currentProject;

        if (target === 'all') return list;
        return list.filter(item => item && item[prop] === target);
    },

    getProjectName(pId) {
        const p = AppState.projects.find(x => x.id === pId);
        return p ? p.name : (pId === 'all' ? 'كافة المشاريع' : pId);
    },

    switchScopeToAll() {
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        if (isEmployee) {
            alert('⚠️ غير مصرح لك بعرض كافة المشاريع. نطاق عملك محدد بمشروعك فقط.');
            return;
        }
        AppState.currentProject = 'all';
        const scopeSelect = document.getElementById('projectSelectScope');
        if (scopeSelect) scopeSelect.value = 'all';
        this.renderAll();
    },

    renderAll() {
        this.applyUserPermissions();
        this.updateProjectDropdowns();
        this.renderDashboard();
        this.renderProjects();
        this.renderSales();
        this.renderPurchases();
        this.renderInventory();
        this.renderAccounts();
        this.renderTransfers();
        this.renderCustomers();
        this.renderSuppliers();
        this.renderAccounting();
        if (this.currentUser?.role === 'admin') {
            this.renderUsers();
        }
    },

    updateProjectDropdowns() {
        const scopeSelect = document.getElementById('projectSelectScope');
        if (scopeSelect) {
            const currentVal = AppState.currentProject;
            let optionsHtml = `<option value="all">🌐 الإدارة الموحدة (كافة المشاريع)</option>`;
            AppState.projects.forEach(p => {
                optionsHtml += `<option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>🏢 ${p.name}</option>`;
            });
            scopeSelect.innerHTML = optionsHtml;
            scopeSelect.value = currentVal;
        }
    },

    /* ========================================================
       1. إدارة المشاريع (إضافة، تعديل، مسح)
       ======================================================== */
    renderProjects() {
        const container = document.getElementById('projectsCardsList');
        if (!container) return;

        container.innerHTML = AppState.projects.map(p => {
            const bt = getProjectBusinessType(p.id);
            const prodsCount = AppState.products.filter(item => item.projectId === p.id).length;
            const salesTotal = AppState.salesInvoices.filter(item => item.projectId === p.id).reduce((s, i) => s + (i.totalAmount || 0), 0);
            const purchTotal = AppState.purchaseInvoices.filter(item => item.projectId === p.id).reduce((s, i) => s + (i.totalAmount || 0), 0);
            const netProfit = salesTotal - purchTotal;

            // حساب السيولة المخصصة لهذا المشروع من واقع قاعدة البيانات
            let allocatedCash = 0;
            AppState.accounts.forEach(a => {
                allocatedCash += (a.allocations && a.allocations[p.id]) || 0;
            });

            return `
            <div class="card p-3 mb-0" style="border-top: 3px solid var(--primary);">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <span class="badge badge-blue">${p.code || 'PROJ'}</span>
                            <span class="badge" style="background:var(--primary-soft); color:var(--primary); font-size:0.72rem;">
                                <i class="fa-solid ${bt.icon}"></i> ${bt.label}
                            </span>
                            ${AppState.currentProject === p.id ? '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> نشط</span>' : ''}
                        </div>
                        <h3 style="font-size:1.15rem; font-weight:800; margin:0;"><i class="fa-solid ${bt.icon}" style="color:var(--primary);"></i> ${p.name}</h3>
                        ${p.description ? `<p class="text-muted small mt-1 mb-0">${p.description}</p>` : ''}
                        <div class="mt-2" style="background:var(--bg-surface); border-radius:6px; padding:0.4rem 0.6rem; font-size:0.75rem; color:var(--text-muted);">
                            <i class="fa-solid fa-lightbulb" style="color:var(--accent);"></i> <strong>البيع:</strong> ${bt.saleTip}
                        </div>
                    </div>
                    <button class="btn btn-sm ${AppState.currentProject === p.id ? 'btn-primary' : 'btn-outline'}" onclick="App.selectProjectScope('${p.id}')">
                        ${AppState.currentProject === p.id ? '<i class="fa-solid fa-check"></i> النطاق النشط' : 'تحديد كنطاق'}
                    </button>
                </div>

                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; text-align:center; margin:0.75rem 0; padding:0.75rem; background:var(--bg-surface); border-radius:8px;">
                    <div>
                        <small class="text-muted" style="font-size:0.72rem;">المبيعات</small>
                        <div class="text-primary" style="font-weight:800; font-size:0.95rem;">${salesTotal.toFixed(0)} ₪</div>
                    </div>
                    <div>
                        <small class="text-muted" style="font-size:0.72rem;">المشتريات</small>
                        <div class="text-secondary" style="font-weight:800; font-size:0.95rem;">${purchTotal.toFixed(0)} ₪</div>
                    </div>
                    <div>
                        <small class="text-muted" style="font-size:0.72rem;">صافي الربح</small>
                        <div class="${netProfit >= 0 ? 'text-success' : 'text-danger'}" style="font-weight:800; font-size:0.95rem;">${netProfit.toFixed(0)} ₪</div>
                    </div>
                    <div>
                        <small class="text-muted" style="font-size:0.72rem;">السيولة</small>
                        <div class="${allocatedCash < 0 ? 'text-danger' : 'text-success'}" style="font-weight:800; font-size:0.95rem;">${allocatedCash.toFixed(0)} ₪</div>
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center">
                    <span class="small text-muted">
                        <i class="fa-solid fa-boxes-stacked"></i> ${prodsCount} ${bt.unitLabel !== 'وحدة' ? 'صنف' : 'عنصر'} مسجل
                        &nbsp;|&nbsp;
                        <i class="fa-solid fa-tag"></i> وحدة: <strong>${bt.unitLabel}</strong>
                        ${bt.hasPriceTiers ? '&nbsp;|&nbsp;<i class="fa-solid fa-layer-group"></i> شرائح أسعار' : ''}
                        ${bt.hasBarcode ? '&nbsp;|&nbsp;<i class="fa-solid fa-barcode"></i> باركود' : ''}
                    </span>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline" onclick="App.openProjectModal('${p.id}')" title="تعديل المشروع"><i class="fa-solid fa-pen"></i> تعديل</button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteProject('${p.id}')" title="مسح المشروع"><i class="fa-solid fa-trash"></i> مسح</button>
                    </div>
                </div>
            </div>`;
        }).join('') || '<div class="text-center py-4 text-muted col-span-2">لا توجد مشاريع مسجلة حالياً</div>';
    },

    selectProjectScope(pId) {
        AppState.currentProject = pId;
        const sel = document.getElementById('projectSelectScope');
        if (sel) sel.value = pId;
        this.renderAll();
    },

    openProjectModal(pId = null) {
        const isEdit = !!pId;
        const proj = isEdit ? AppState.projects.find(p => p.id === pId) : null;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = isEdit 
            ? `<i class="fa-solid fa-pen text-primary"></i> تعديل بيانات المشروع: ${proj.name}` 
            : `<i class="fa-solid fa-plus text-primary"></i> إضافة مشروع استثماري جديد`;

        const btOptions = Object.entries(BUSINESS_TYPES).map(([key, bt]) => 
            `<option value="${key}" ${proj && proj.businessType === key ? 'selected' : ''}><i class="fa-solid ${bt.icon}"></i> ${bt.label}</option>`
        ).join('');

        const currentBT = proj ? (BUSINESS_TYPES[proj.businessType] || BUSINESS_TYPES.other) : BUSINESS_TYPES.other;

        body.innerHTML = `
            <div class="form-group mb-3">
                <label class="form-label">اسم المشروع الكامل:</label>
                <input type="text" id="pModalName" class="form-control" value="${proj ? proj.name : ''}" placeholder="مثال: محل الفلافل، محل الخضار، مستودع التوزيع...">
            </div>
            <div class="form-group mb-3">
                <label class="form-label"><i class="fa-solid fa-tags"></i> نوع النشاط التجاري: <span class="text-danger">*</span></label>
                <select id="pModalType" class="form-control" onchange="App.previewBusinessType()">
                    ${btOptions}
                </select>
                <div id="btPreview" class="mt-2 p-2 rounded" style="background:var(--bg-surface); font-size:0.82rem; display:none; border-right: 3px solid var(--primary);">
                    <strong>البيع:</strong> <span id="btSaleTip"></span><br>
                    <strong>الشراء:</strong> <span id="btPurchaseTip"></span><br>
                    <strong>وحدة القياس الافتراضية:</strong> <span id="btUnit"></span>
                </div>
            </div>
            <div class="grid-2 mb-3">
                <div class="form-group">
                    <label class="form-label">كود المشروع التعريفي:</label>
                    <input type="text" id="pModalCode" class="form-control" value="${proj ? proj.code : ''}" placeholder="مثال: FOOD, VEG, REST">
                </div>
                <div class="form-group">
                    <label class="form-label">العملة:</label>
                    <input type="text" id="pModalCurrency" class="form-control" value="ILS" readonly>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">وصف النشاط التجاري (اختياري):</label>
                <textarea id="pModalDesc" class="form-control" rows="2" placeholder="وصف مختصر لمجال عمل وتخصص المشروع">${proj ? (proj.description || '') : ''}</textarea>
            </div>
        `;

        // إظهار المعاينة عند الفتح مباشرة
        setTimeout(() => this.previewBusinessType(), 50);

        submit.style.display = 'inline-flex';
        submit.innerText = isEdit ? 'حفظ التعديلات' : 'إنشاء المشروع وحفظه بالسحابة';
        submit.onclick = () => {
            const name = document.getElementById('pModalName').value.trim();
            const code = document.getElementById('pModalCode').value.trim();
            const desc = document.getElementById('pModalDesc').value.trim();
            const businessType = document.getElementById('pModalType').value;

            if (!name) { alert('الرجاء إدخال اسم المشروع.'); return; }

            if (isEdit) {
                proj.name = name;
                proj.code = code || proj.code;
                proj.description = desc;
                proj.businessType = businessType;
            } else {
                const newId = 'proj_' + Date.now().toString().slice(-4);
                AppState.projects.push({
                    id: newId,
                    name: name,
                    code: code || ('P' + (AppState.projects.length + 1)),
                    currency: 'ILS',
                    description: desc,
                    businessType: businessType
                });

                // تصفير حصة هذا المشروع الجديد في كل الحسابات
                AppState.accounts.forEach(acc => {
                    if (!acc.allocations) acc.allocations = {};
                    acc.allocations[newId] = 0.00;
                });
            }

            this.saveState();
            this.closeModal('genericModal');
            this.renderAll();
            const btLabel = BUSINESS_TYPES[businessType]?.label || businessType;
            alert(isEdit ? `تم تحديث المشروع بنجاح.\nنوع النشاط: ${btLabel}` : `تم إنشاء المشروع وحفظه في السحابة بنجاح!\nنوع النشاط: ${btLabel}\nالنظام الآن مُهيّأ بشكل مناسب لطبيعة هذا المشروع.`);
        };

        this.openModal('genericModal');
    },

    previewBusinessType() {
        const sel = document.getElementById('pModalType');
        const preview = document.getElementById('btPreview');
        if (!sel || !preview) return;
        const bt = BUSINESS_TYPES[sel.value];
        if (!bt) return;
        document.getElementById('btSaleTip').innerText = bt.saleTip;
        document.getElementById('btPurchaseTip').innerText = bt.purchaseTip;
        document.getElementById('btUnit').innerText = bt.unitLabel + ' | وحدات متاحة: ' + bt.units.join('، ');
        preview.style.display = 'block';
    },

    deleteProject(pId) {
        const proj = AppState.projects.find(p => p.id === pId);
        if (!proj) return;

        if (AppState.projects.length <= 1) {
            alert('لا يمكن مسح المشروع الوحيد المتبقي.');
            return;
        }

        const prodsCount = AppState.products.filter(p => p.projectId === pId).length;
        const salesCount = AppState.salesInvoices.filter(s => s.projectId === pId).length;

        const msg = `هل أنت متأكد من مسح مشروع "${proj.name}"؟\n` +
                    (prodsCount > 0 ? `⚠️ سيتم حذف (${prodsCount}) صنف تابع لهذا المشروع.\n` : '') +
                    (salesCount > 0 ? `⚠️ سيتم حذف (${salesCount}) فاتورة مبيعات مسجلة له.\n` : '') +
                    `\nتأكيد المسح؟`;

        if (!confirm(msg)) return;

        // مسح الأصناف والفواتير والحصص التابعة
        AppState.products = AppState.products.filter(p => p.projectId !== pId);
        AppState.salesInvoices = AppState.salesInvoices.filter(s => s.projectId !== pId);
        AppState.purchaseInvoices = AppState.purchaseInvoices.filter(p => p.projectId !== pId);
        AppState.accounts.forEach(acc => {
            if (acc.allocations && acc.allocations[pId] !== undefined) {
                delete acc.allocations[pId];
            }
        });
        AppState.projects = AppState.projects.filter(p => p.id !== pId);

        if (AppState.currentProject === pId) AppState.currentProject = 'all';

        this.saveState();
        this.renderAll();
        alert(`تم مسح المشروع "${proj.name}" بنجاح.`);
    },

    /* ========================================================
       2. لوحة التحكم والرسوم البيانية (Dashboard)
       ======================================================== */
    renderDashboard() {
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const cur = isEmployee ? user.assignedProject : AppState.currentProject;
        const isAll = !isEmployee && cur === 'all';

        const sales = this.filterProject(AppState.salesInvoices);
        const totalSales = sales.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

        let cogs = 0;
        sales.forEach(inv => {
            (inv.items || []).forEach(it => {
                cogs += (it.costPrice || 0) * (it.qty || 0);
            });
        });
        const netProfit = totalSales - cogs;

        const prods = this.filterProject(AppState.products);
        const invVal = prods.reduce((sum, p) => sum + ((p.stock || 0) * (p.costPrice || 0)), 0);

        let totalCash = 0;
        AppState.accounts.forEach(acc => {
            if (isAll) {
                totalCash += acc.balance || 0;
            } else {
                totalCash += (acc.allocations && acc.allocations[cur]) || 0;
            }
        });

        document.getElementById('dashTotalSales').innerText = `${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪`;
        document.getElementById('dashNetProfit').innerText = `${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪`;
        document.getElementById('dashInventoryVal').innerText = `${invVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪`;
        document.getElementById('dashTotalLiquidity').innerText = `${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪`;

        const recentBody = document.getElementById('dashRecentSalesBody');
        if (recentBody) {
            recentBody.innerHTML = sales.slice(0, 5).map(s => `
                <tr>
                    <td><strong>${s.invoiceNumber || '—'}</strong></td>
                    <td>${s.date || '—'}</td>
                    <td><span class="badge badge-blue">${this.getProjectName(s.projectId)}</span></td>
                    <td>${s.customerName || 'عميل نقدي'}</td>
                    <td><strong class="text-primary">${formatMoney(s.totalAmount)} ₪</strong></td>
                    <td>${(s.payments || []).map(p => `<span class="badge badge-green">${formatMoney(p.amount)}₪</span>`).join(' ') || 'آجل'}</td>
                    <td>${safeNum(s.remainingDue) <= 0 ? '<span class="badge badge-green">مسددة</span>' : '<span class="badge badge-red">متبقي ذمة</span>'}</td>
                </tr>
            `).join('') || '<tr><td colspan="7" class="text-center py-3 text-muted">لا توجد عمليات مبيعات مسجلة في قاعدة البيانات بعد</td></tr>';
        }

        this.renderCharts();
    },

    renderCharts() {
        if (typeof Chart === 'undefined') return;

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const activeProjId = isEmployee ? user.assignedProject : AppState.currentProject;

        // تحديث عنوان الكارد في لوحة التحكم لمطابقة المشروع المفتوح للموظف
        const cardHeaderSpan = document.querySelector('#page-dashboard .charts-row .card:first-child .card-header span');
        if (cardHeaderSpan) {
            if (activeProjId !== 'all') {
                const pName = this.getProjectName(activeProjId);
                cardHeaderSpan.innerHTML = `<i class="fa-solid fa-chart-column text-primary"></i> أداء مشروع (${pName})`;
            } else {
                cardHeaderSpan.innerHTML = `<i class="fa-solid fa-chart-column text-primary"></i> مقارنة الأداء بين المشروعين`;
            }
        }

        // تحديد المشاريع: للموظف يظهر مشروعه المفتوح فقط
        const targetProjects = (activeProjId !== 'all') 
            ? AppState.projects.filter(p => p.id === activeProjId)
            : AppState.projects;

        const labels = targetProjects.map(p => p.name);
        const salesData = targetProjects.map(p => {
            return AppState.salesInvoices.filter(i => i.projectId === p.id).reduce((s, i) => s + (i.totalAmount || 0), 0);
        });
        const purchData = targetProjects.map(p => {
            return AppState.purchaseInvoices.filter(i => i.projectId === p.id).reduce((s, i) => s + (i.totalAmount || 0), 0);
        });

        const ctx1 = document.getElementById('projectComparisonChart');
        if (ctx1) {
            if (this.comparisonChart) this.comparisonChart.destroy();
            this.comparisonChart = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: labels.length ? labels : ['لا توجد مشاريع'],
                    datasets: [
                        { label: 'المبيعات (₪)', data: salesData, backgroundColor: '#2563eb', borderRadius: 6 },
                        { label: 'المشتريات (₪)', data: purchData, backgroundColor: '#0f766e', borderRadius: 6 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { font: { family: 'Tajawal' } } } }
                }
            });
        }

        // توزيع وسائل الدفع لمشروع الموظف فقط
        let payBank = 0, payWallet = 0, payJawwal = 0, payCash = 0;
        const targetSales = (activeProjId !== 'all')
            ? AppState.salesInvoices.filter(i => i.projectId === activeProjId)
            : AppState.salesInvoices;

        targetSales.forEach(inv => {
            (inv.payments || []).forEach(p => {
                if (p.method === 'bank') payBank += (p.amount || 0);
                else if (p.method === 'wallet') payWallet += (p.amount || 0);
                else if (p.method === 'jawwal') payJawwal += (p.amount || 0);
                else if (p.method === 'cash') payCash += (p.amount || 0);
            });
        });

        const ctx2 = document.getElementById('paymentMethodsChart');
        if (ctx2) {
            if (this.paymentsChart) this.paymentsChart.destroy();
            this.paymentsChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['بنك فلسطين', 'محفظة PalPay', 'جوال باي', 'الكاش'],
                    datasets: [{
                        data: [payBank || 0.001, payWallet || 0.001, payJawwal || 0.001, payCash || 0.001],
                        backgroundColor: ['#2563eb', '#0f766e', '#16a34a', '#d97706']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal' } } } }
                }
            });
        }
    },

    /* ========================================================
       3. المبيعات ونقاط البيع (إصدار، تعديل، حذف)
       ======================================================== */
    renderSales() {
        const tbody = document.getElementById('salesTableBody');
        if (!tbody) return;

        const payMethodsMap = {
            bank: { name: 'بنك فلسطين', icon: 'fa-building-columns', color: '#2563eb' },
            wallet: { name: 'محفظة PalPay', icon: 'fa-wallet', color: '#0f766e' },
            jawwal: { name: 'جوال باي', icon: 'fa-mobile-screen', color: '#16a34a' },
            cash: { name: 'كاش', icon: 'fa-money-bill-wave', color: '#d97706' }
        };

        const allSales = AppState.salesInvoices || [];
        const sales = this.filterProject(allSales);

        if (sales.length === 0) {
            if (allSales.length > 0 && AppState.currentProject !== 'all') {
                tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">
                    <i class="fa-solid fa-filter mb-2" style="font-size:1.5rem; display:block; opacity:0.5;"></i>
                    لا توجد فواتير مبيعات مسجلة في مشروع (${this.getProjectName(AppState.currentProject)}).<br>
                    <button class="btn btn-sm btn-outline mt-2" onclick="App.switchScopeToAll()">
                        <i class="fa-solid fa-globe"></i> عرض فواتير كافة المشاريع (${allSales.length} فاتورة مسجلة)
                    </button>
                </td></tr>`;
            } else {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">لا توجد فواتير مبيعات مسجلة في قاعدة البيانات بعد</td></tr>';
            }
            return;
        }

        tbody.innerHTML = sales.map(s => {
            try {
                const bt = getProjectBusinessType(s.projectId);
                // ملخص الأصناف مع الوحدة
                const itemsSummary = (s.items || []).map(it => {
                    const unit = it.unit || bt.unitLabel;
                    return `<span style="font-size:0.78rem;">${it.name || 'صنف'} <strong>${safeNum(it.qty)}${unit ? ' ' + unit : ''}</strong></span>`;
                }).join(' + ') || '—';

                const paymentsList = (s.payments || []).filter(p => safeNum(p.amount) > 0);
                const paymentDetailsHtml = paymentsList.length > 0
                    ? paymentsList.map(p => {
                        const mInfo = payMethodsMap[p.method] || { name: p.method || 'دفعة', icon: 'fa-receipt', color: '#64748b' };
                        const refHtml = p.ref ? `<div style="font-size:0.7rem; color:#475569; margin-top:1px;"><i class="fa-solid fa-receipt"></i> <strong>وصل:</strong> <span class="badge" style="background:#f1f5f9; color:#0f172a; padding:1px 4px;">${p.ref}</span></div>` : '';
                        return `
                            <div style="font-size:0.75rem; line-height:1.25; margin-bottom:4px; padding:2px 4px; border-radius:4px; background:var(--bg-surface);">
                                <span style="color:${mInfo.color}; font-weight:700;"><i class="fa-solid ${mInfo.icon}"></i> ${mInfo.name}:</span>
                                <span class="font-bold">${formatMoney(p.amount)} ₪</span>
                                ${refHtml}
                            </div>
                        `;
                    }).join('')
                    : (safeNum(s.paidAmount) <= 0 
                        ? '<span class="badge badge-red" style="font-size:0.72rem;"><i class="fa-solid fa-clock"></i> آجل بالكامل (ذمة)</span>' 
                        : '<span class="text-muted" style="font-size:0.75rem;">—</span>');

                const totalAmt = safeNum(s.totalAmount);
                const paidAmt = safeNum(s.paidAmount);
                const remDue = safeNum(s.remainingDue);
                const surplusAmt = safeNum(s.surplusAmount);

                return `
                <tr>
                    <td><strong>${s.invoiceNumber || '—'}</strong></td>
                    <td>${s.date || '—'}</td>
                    <td><span class="badge badge-blue"><i class="fa-solid ${bt.icon}"></i> ${this.getProjectName(s.projectId)}</span></td>
                    <td><strong>${s.customerName || 'عميل نقدي'}</strong></td>
                    <td style="font-size:0.78rem; max-width:160px;">${itemsSummary}</td>
                    <td><strong class="text-primary">${formatMoney(totalAmt)} ₪</strong></td>
                    <td>
                        <strong class="text-success">${formatMoney(paidAmt)} ₪</strong>
                        ${surplusAmt > 0 ? `<br><span class="badge" style="background:#ecfdf5; color:#059669; font-size:0.68rem; margin-top:2px;" title="تم استخدام الفائض لخصم ديون سابقة للعميل بهذا المشروع"><i class="fa-solid fa-arrow-down-long"></i> فائض مسدد للديون: +${formatMoney(surplusAmt)} ₪</span>` : ''}
                        ${s.surplusPaymentsReceived && s.surplusPaymentsReceived.length > 0 ? `<br><span class="badge" style="background:#eff6ff; color:#1d4ed8; font-size:0.68rem; margin-top:2px;" title="سُدد جزء من هذه الفاتورة من فائض دفع"><i class="fa-solid fa-receipt"></i> سُدد من فائض: ${s.surplusPaymentsReceived.map(sp => formatMoney(sp.amount) + ' ₪ من ' + sp.fromInvoice).join('، ')}</span>` : ''}
                    </td>
                    <td style="min-width:130px;">${paymentDetailsHtml}</td>
                    <td><strong class="${remDue > 0 ? 'text-danger' : 'text-muted'}">${formatMoney(remDue)} ₪</strong></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline" onclick="App.editSaleInvoice('${s.id}')" title="تعديل الفاتورة"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteSaleInvoice('${s.id}')" title="حذف الفاتورة"><i class="fa-solid fa-trash"></i></button>
                            <button class="btn btn-sm btn-outline" onclick="App.printInvoice('${s.id}')" title="طباعة"><i class="fa-solid fa-print"></i></button>
                        </div>
                    </td>
                </tr>`;
            } catch (rowErr) {
                console.error('Invoice row render error:', rowErr, s);
                return `<tr><td colspan="10" class="text-danger py-2">خطأ في عرض فاتورة (${s.invoiceNumber || s.id || 'غير معروفة'})</td></tr>`;
            }
        }).join('');
    },

    openSaleModal() {
        this.editingSaleId = null;
        this.saleItems = [];
        const primaryAcc = AppState.accounts.find(a => a.isPrimary) || AppState.accounts[0];
        this.paymentRows = [{ method: primaryAcc.type, accountId: primaryAcc.id, amount: 0, ref: '' }];

        const projSelect = document.getElementById('saleProj');
        if (projSelect) {
            if (this.currentUser && this.currentUser.role !== 'admin' && !this.currentUser.permissions?.canViewAllProjects) {
                const assigned = this.currentUser.assignedProject || AppState.projects[0]?.id;
                projSelect.innerHTML = `<option value="${assigned}">🏢 ${this.getProjectName(assigned)}</option>`;
                projSelect.value = assigned;
                projSelect.disabled = true;
            } else {
                projSelect.disabled = false;
                projSelect.innerHTML = AppState.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                projSelect.value = AppState.currentProject === 'all' ? (AppState.projects[0]?.id || '') : AppState.currentProject;
            }
        }

        const custNameInput = document.getElementById('saleCustName');
        if (custNameInput) custNameInput.value = 'عميل نقدي';
        this.updateCustomerDatalist();

        this.onSaleProjectChanged();
        this.renderSaleItems();
        this.renderPaymentRows();
        this.openModal('saleModal');
    },

    editSaleInvoice(invId) {
        const inv = AppState.salesInvoices.find(s => s.id === invId);
        if (!inv) return;

        this.editingSaleId = invId;
        this.saleItems = JSON.parse(JSON.stringify(inv.items || []));
        this.paymentRows = JSON.parse(JSON.stringify(inv.payments || []));
        if (!this.paymentRows.length) {
            const primaryAcc = AppState.accounts.find(a => a.isPrimary) || AppState.accounts[0];
            this.paymentRows = [{ method: primaryAcc.type, accountId: primaryAcc.id, amount: 0, ref: '' }];
        }

        const projSelect = document.getElementById('saleProj');
        if (projSelect) {
            projSelect.innerHTML = AppState.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            projSelect.value = inv.projectId;
        }

        const custNameInput = document.getElementById('saleCustName');
        if (custNameInput) custNameInput.value = inv.customerName || 'عميل نقدي';
        this.updateCustomerDatalist();

        this.onSaleProjectChanged();

        const tierSelect = document.getElementById('saleTier');
        if (tierSelect) tierSelect.value = inv.priceTier || 'retail';

        this.renderSaleItems();
        this.renderPaymentRows();
        this.openModal('saleModal');
    },

    deleteSaleInvoice(invId) {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! لا يمكن حذف الفواتير.');
            return;
        }
        if (this.currentUser?.role !== 'admin') {
            alert('⚠️ حذف فواتير المبيعات مخصص للمدير العام فقط!');
            return;
        }

        const inv = AppState.salesInvoices.find(s => s.id === invId);
        if (!inv) return;

        if (!confirm(`هل أنت متأكد من حذف فاتورة المبيعات (${inv.invoiceNumber})؟\nسيتم إرجاع البضاعة للمخزن وعكس أثر المبالغ بالحسابات المالية.`)) return;

        // عكس أثر الفاتورة محاسبياً ومخزنياً
        this.reverseSaleInvoiceEffects(inv);

        // حذف الفاتورة من المصفوفة
        AppState.salesInvoices = AppState.salesInvoices.filter(s => s.id !== invId);

        this.saveState();
        this.renderAll();
        alert(`تم حذف الفاتورة ${inv.invoiceNumber} وعكس أثرها المالي والمخزني بنجاح.`);
    },

    reverseSaleInvoiceEffects(inv) {
        // 1. إعادة البضاعة للمخزن
        (inv.items || []).forEach(it => {
            const prod = AppState.products.find(p => p.id === it.productId);
            if (prod && !prod.isUnknownStock && prod.stock !== null && prod.stock !== undefined) {
                prod.stock += it.qty;
            }
        });

        // 2. خصم المبالغ المقبوضة من الحسابات المالية
        (inv.payments || []).forEach(p => {
            const acc = AppState.accounts.find(a => a.id === p.accountId);
            if (acc) {
                acc.balance -= p.amount;
                if (acc.allocations && acc.allocations[inv.projectId]) {
                    acc.allocations[inv.projectId] -= p.amount;
                }
            }
        });

        // 3. عكس أثر توزيع الفائض على فواتير العميل السابقة في هذا المشروع
        if (inv.surplusDistribution && Array.isArray(inv.surplusDistribution)) {
            inv.surplusDistribution.forEach(dist => {
                const oldInv = AppState.salesInvoices.find(s => s.id === dist.invoiceId);
                if (oldInv) {
                    oldInv.remainingDue = parseFloat(((oldInv.remainingDue || 0) + dist.amount).toFixed(2));
                    oldInv.paidAmount = Math.max(0, parseFloat(((oldInv.paidAmount || 0) - dist.amount).toFixed(2)));
                    oldInv.status = oldInv.remainingDue <= 0 ? 'completed' : 'partial';
                    if (oldInv.surplusPaymentsReceived) {
                        oldInv.surplusPaymentsReceived = oldInv.surplusPaymentsReceived.filter(sp => sp.fromInvoice !== inv.invoiceNumber);
                    }
                }
            });
        }
    },

    onSaleProjectChanged() {
        const pId = document.getElementById('saleProj').value;
        const itemSelect = document.getElementById('saleItemSelect');
        const bt = getProjectBusinessType(pId);

        this.updateCustomerDatalist();
        this.updatePaymentCalculations();

        // تكيف شريحة السعر حسب نوع النشاط
        const tierWrapper = document.getElementById('saleTierWrapper');
        if (tierWrapper) {
            if (bt.hasPriceTiers) {
                tierWrapper.style.display = '';
            } else {
                tierWrapper.style.display = 'none';
                const tierSel = document.getElementById('saleTier');
                if (tierSel) tierSel.value = 'retail';
            }
        }

        // تحديث label الكمية بوحدة المشروع
        const qtyLabel = document.getElementById('saleQtyLabel');
        if (qtyLabel) qtyLabel.textContent = `الكمية (${bt.unitLabel}):`;

        // تحديث step الكمية حسب نوع الوحدة
        const qtyInput = document.getElementById('saleItemQty');
        if (qtyInput) {
            const isWeight = ['كيلو','لتر','متر','طن'].some(u => bt.unitLabel.includes(u) || bt.units.some(bu => bu === u && bu === bt.unitLabel));
            qtyInput.step = isWeight ? '0.1' : '1';
            qtyInput.min = isWeight ? '0.1' : '1';
        }

        // عرض تلميح نوع النشاط
        const saleTipBox = document.getElementById('saleBizTip');
        if (saleTipBox) {
            saleTipBox.innerHTML = `<i class="fa-solid fa-lightbulb" style="color:var(--accent);"></i> <strong>${bt.label}:</strong> ${bt.saleTip}`;
        }

        if (itemSelect) {
            const prods = AppState.products.filter(p => p.projectId === pId);
            itemSelect.innerHTML = prods.map(p => {
                const unit = p.unit || bt.unitLabel;
                const isUnknown = p.isUnknownStock || p.stock === null || p.stock === undefined || p.stock === 'unknown';
                const stockInfo = bt.hasStock ? (isUnknown ? ` — متوفر: (غير معروف)` : ` — متوفر: ${p.stock} ${unit}`) : '';
                return `<option value="${p.id}" data-retail="${p.retailPrice}" data-semi="${p.semiWholesalePrice || p.retailPrice}" data-wholesale="${p.wholesalePrice || p.retailPrice}" data-unit="${unit}">
                    ${p.name}${stockInfo}
                </option>`;
            }).join('') || '<option value="">لا توجد أصناف في هذا المشروع</option>';
        }

        this.onSaleCustomerChanged();
    },

    onSaleCustomerChanged() {
        this.onSaleTierChanged();
    },

    getCustomersSummary(forcedProjectId = null) {
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = forcedProjectId || (isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null));

        const custMap = {};

        // 1. العملاء المسجلون يدوياً
        if (AppState.customers) {
            AppState.customers.forEach(c => {
                if (!c || !c.name || !c.name.trim()) return;
                const n = c.name.trim();

                // إذا كان هناك مشروع محدد، يتم فقط تضمين من يخص هذا المشروع
                if (targetProj) {
                    const hasInvoicesInProj = AppState.salesInvoices.some(inv => (inv.customerName || 'عميل نقدي') === n && inv.projectId === targetProj);
                    const isRegisteredInProj = c.projectId === targetProj;
                    // إذا لم يكن مسجلاً في هذا المشروع ولا يملك فواتير فيه، يتم استبعاده تماماً
                    if (!isRegisteredInProj && !hasInvoicesInProj) return;
                }

                custMap[n] = { 
                    name: n, 
                    id: c.id,
                    projectId: c.projectId || targetProj || 'all',
                    invCount: 0, 
                    totalSales: 0, 
                    p1Due: 0, 
                    p2Due: 0, 
                    totalDue: 0 
                };
            });
        }

        // 2. فواتير المبيعات الصادرة
        AppState.salesInvoices.forEach(inv => {
            const name = (inv.customerName && inv.customerName.trim()) ? inv.customerName.trim() : 'عميل نقدي';
            
            // استبعاد الفواتير التي لا تخص المشروع المستهدف
            if (targetProj && inv.projectId !== targetProj) return;

            if (!custMap[name]) {
                custMap[name] = { 
                    name: name, 
                    invCount: 0, 
                    totalSales: 0, 
                    p1Due: 0, 
                    p2Due: 0, 
                    totalDue: 0 
                };
            }
            custMap[name].invCount += 1;
            custMap[name].totalSales += (inv.totalAmount || 0);
            if (inv.remainingDue > 0) {
                if (inv.projectId === 'proj_01') custMap[name].p1Due += inv.remainingDue;
                else if (inv.projectId === 'proj_02') custMap[name].p2Due += inv.remainingDue;
                custMap[name].totalDue += inv.remainingDue;
            }
        });

        return custMap;
    },

    getSuppliersForProject(targetProjectId = null) {
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = targetProjectId || (isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null));

        if (!targetProj || targetProj === 'all') return AppState.suppliers || [];

        return (AppState.suppliers || []).filter(s => {
            // 1. مسجل صراحة في هذا المشروع
            if (s.projectId === targetProj) return true;
            // 2. له رصيد معلق مسجل في هذا المشروع
            if (s.balances && s.balances[targetProj] !== undefined && s.balances[targetProj] !== 0) return true;
            // 3. له فواتير مشتريات سابقة مسجلة في هذا المشروع
            if (AppState.purchaseInvoices && AppState.purchaseInvoices.some(p => (p.supplierId === s.id || p.supplierName === s.name) && p.projectId === targetProj)) return true;
            return false;
        });
    },

    updateCustomerDatalist() {
        const dl = document.getElementById('recentCustomersDatalist');
        const selectDropdown = document.getElementById('saleCustSelectDropdown');
        
        // جلب العملاء الملائمين لنطاق المشروع المفتوح
        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const activeProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null);
        const custMap = this.getCustomersSummary(activeProj);

        // تصفية وترتيب: عملاء الذمم أولاً ثم باقي العملاء
        const allList = Object.values(custMap).filter(c => c.name && c.name !== 'عميل نقدي');
        allList.sort((a, b) => (b.totalDue - a.totalDue) || a.name.localeCompare(b.name, 'ar'));

        // 1. تحديث القائمة المنسدلة (Select Dropdown) الخاصة بعملاء الذمم
        if (selectDropdown) {
            let selectHtml = '<option value="">-- عملاء الذمم --</option>';
            selectHtml += '<option value="عميل نقدي">💵 عميل نقدي</option>';

            const duesList = allList.filter(c => c.totalDue > 0);
            if (duesList.length > 0) {
                selectHtml += `<optgroup label="📋 عملاء عليهم ذمم مستحقة (${duesList.length})">`;
                duesList.forEach(c => {
                    selectHtml += `<option value="${c.name}">${c.name} (ذمة: ${c.totalDue.toFixed(2)} ₪)</option>`;
                });
                selectHtml += `</optgroup>`;
            }

            const noDuesList = allList.filter(c => c.totalDue <= 0);
            if (noDuesList.length > 0) {
                selectHtml += `<optgroup label="👥 عملاء مسجلون آخرون">`;
                noDuesList.forEach(c => {
                    selectHtml += `<option value="${c.name}">${c.name}</option>`;
                });
                selectHtml += `</optgroup>`;
            }

            selectDropdown.innerHTML = selectHtml;
            const curVal = document.getElementById('saleCustName')?.value;
            if (curVal && selectDropdown.querySelector(`option[value="${curVal}"]`)) {
                selectDropdown.value = curVal;
            } else {
                selectDropdown.value = '';
            }
        }

        // 2. تحديث الـ Datalist للإكمال التلقائي عند الكتابة باليد
        if (dl) {
            let optionsHtml = '<option value="عميل نقدي">عميل نقدي</option>';
            allList.forEach(c => {
                const dueText = c.totalDue > 0 ? ` [عليه ذمة: ${c.totalDue.toFixed(2)} ₪]` : '';
                optionsHtml += `<option value="${c.name}">${c.name}${dueText}</option>`;
            });
            dl.innerHTML = optionsHtml;
        }

        this.onSaleCustInput();
    },

    onSelectCustomerDropdown(name) {
        if (!name) return;
        const input = document.getElementById('saleCustName');
        if (input) {
            input.value = name;
            this.onSaleCustInput();
            this.onSaleCustomerChanged();
        }
    },

    onSaleCustInput() {
        const input = document.getElementById('saleCustName');
        const notice = document.getElementById('saleCustDueNotice');
        if (!input || !notice) return;

        const val = input.value.trim();
        if (!val || val === 'عميل نقدي') {
            notice.innerHTML = '';
            notice.style.display = 'none';
            return;
        }

        const custMap = this.getCustomersSummary();
        const cust = custMap[val];

        if (cust && cust.totalDue > 0) {
            notice.innerHTML = `<span class="badge badge-red" style="font-size:0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> ذمة سابقة: ${cust.totalDue.toFixed(2)} ₪</span>`;
            notice.style.display = 'inline-block';
        } else if (cust) {
            notice.innerHTML = `<span class="badge badge-green" style="font-size:0.75rem;"><i class="fa-solid fa-check"></i> عميل مسجل</span>`;
            notice.style.display = 'inline-block';
        } else {
            notice.innerHTML = `<span class="badge badge-blue" style="font-size:0.75rem;"><i class="fa-solid fa-user-plus"></i> عميل جديد</span>`;
            notice.style.display = 'inline-block';
        }

        this.updatePaymentCalculations();
    },

    onSaleTierChanged() {
        this.onSaleItemSelectChanged();
    },

    onSaleItemSelectChanged() {
        const itemSelect = document.getElementById('saleItemSelect');
        const tier = document.getElementById('saleTier').value;
        const priceInput = document.getElementById('saleItemPrice');

        if (!itemSelect || !priceInput) return;
        const opt = itemSelect.options[itemSelect.selectedIndex];
        if (!opt) return;

        if (tier === 'wholesale') priceInput.value = opt.getAttribute('data-wholesale') || 0;
        else if (tier === 'semi_wholesale') priceInput.value = opt.getAttribute('data-semi') || 0;
        else priceInput.value = opt.getAttribute('data-retail') || 0;
    },

    addSaleItem() {
        const itemSelect = document.getElementById('saleItemSelect');
        const qtyInput = document.getElementById('saleItemQty');
        const priceInput = document.getElementById('saleItemPrice');

        if (!itemSelect) return;
        const pId = itemSelect.value;
        const prod = AppState.products.find(p => p.id === pId);
        const qty = parseFloat(qtyInput.value) || 1;
        const unitPrice = parseFloat(priceInput.value) || 0;

        if (!prod) {
            alert('الرجاء اختيار صنف مسجل.');
            return;
        }

        const projId = document.getElementById('saleProj').value;
        const bt = getProjectBusinessType(projId);
        const unit = prod.unit || bt.unitLabel;

        this.saleItems.push({
            productId: prod.id,
            name: prod.name,
            costPrice: prod.costPrice,
            qty: qty,
            unit: unit,
            unitPrice: unitPrice,
            total: qty * unitPrice
        });

        this.renderSaleItems();
    },

    removeSaleItem(idx) {
        this.saleItems.splice(idx, 1);
        this.renderSaleItems();
    },

    renderSaleItems() {
        const tbody = document.getElementById('saleItemsBody');
        const sumDisplay = document.getElementById('saleTotalSum');
        if (!tbody) return;

        let total = 0;
        tbody.innerHTML = this.saleItems.map((item, idx) => {
            total += item.total;
            const unitLabel = item.unit || '';
            return `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td><strong>${item.qty}</strong>${unitLabel ? ` <small class="text-muted">${unitLabel}</small>` : ''}</td>
                <td>${item.unitPrice.toFixed(2)} ₪</td>
                <td><strong>${item.total.toFixed(2)} ₪</strong></td>
                <td><button class="btn btn-sm btn-outline text-danger" onclick="App.removeSaleItem(${idx})">&times;</button></td>
            </tr>`;
        }).join('') || '<tr><td colspan="5" class="text-center text-muted py-2">أضف أصنافاً للفاتورة</td></tr>';

        if (sumDisplay) sumDisplay.innerText = `${total.toFixed(2)} ₪`;
        this.updatePaymentCalculations();
    },

    addPaymentRow() {
        const primaryAcc = AppState.accounts.find(a => a.isPrimary) || AppState.accounts[0];
        this.paymentRows.push({ method: primaryAcc.type, accountId: primaryAcc.id, amount: 0, ref: '' });
        this.renderPaymentRows();
    },

    removePaymentRow(idx) {
        this.paymentRows.splice(idx, 1);
        this.renderPaymentRows();
    },

    renderPaymentRows() {
        const wrapper = document.getElementById('paymentRowsWrapper');
        if (!wrapper) return;

        wrapper.innerHTML = this.paymentRows.map((row, idx) => `
            <div class="grid-4 gap-2 mb-2 align-items-center">
                <div>
                    <label class="form-label" style="font-size:0.75rem;">وسيلة الدفع:</label>
                    <select class="form-control" onchange="App.onPayMethodChange(${idx}, this.value)">
                        <option value="bank" ${row.method === 'bank' ? 'selected' : ''}>بنك فلسطين (تحويل)</option>
                        <option value="wallet" ${row.method === 'wallet' ? 'selected' : ''}>محفظة PalPay</option>
                        <option value="jawwal" ${row.method === 'jawwal' ? 'selected' : ''}>جوال باي</option>
                        <option value="cash" ${row.method === 'cash' ? 'selected' : ''}>نقداً (كاش)</option>
                    </select>
                </div>
                <div>
                    <label class="form-label" style="font-size:0.75rem;">الحساب المشترك:</label>
                    <select class="form-control" onchange="App.onPayAccountChange(${idx}, this.value)">
                        ${AppState.accounts.map(a => `<option value="${a.id}" ${row.accountId === a.id ? 'selected' : ''}>${a.name} (رصيد: ${a.balance.toFixed(2)}₪)</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label" style="font-size:0.75rem;">المبلغ المدفوع (₪):</label>
                    <input type="number" class="form-control" value="${row.amount}" step="0.01" oninput="App.onPayAmountChange(${idx}, this.value)">
                </div>
                <div class="d-flex align-items-end gap-1">
                    <div style="flex:1;">
                        <label class="form-label" style="font-size:0.75rem;">مرجع / وصل:</label>
                        <input type="text" class="form-control" value="${row.ref || ''}" placeholder="رقم إيصال" oninput="App.onPayRefChange(${idx}, this.value)">
                    </div>
                    <button class="btn btn-outline text-danger btn-sm" onclick="App.removePaymentRow(${idx})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('');

        this.updatePaymentCalculations();
    },

    onPayMethodChange(idx, val) {
        this.paymentRows[idx].method = val;
        const acc = AppState.accounts.find(a => a.type === val);
        if (acc) this.paymentRows[idx].accountId = acc.id;
        this.renderPaymentRows();
    },

    onPayAccountChange(idx, val) {
        this.paymentRows[idx].accountId = val;
    },

    onPayAmountChange(idx, val) {
        this.paymentRows[idx].amount = parseFloat(val) || 0;
        this.updatePaymentCalculations();
    },

    onPayRefChange(idx, val) {
        this.paymentRows[idx].ref = val;
    },

    updatePaymentCalculations() {
        const total = parseFloat(this.saleItems.reduce((s, i) => s + i.total, 0).toFixed(2));
        const paid = parseFloat(this.paymentRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2));
        const due = Math.max(0, parseFloat((total - paid).toFixed(2)));
        const surplus = paid > total ? parseFloat((paid - total).toFixed(2)) : 0;

        const paidSum = document.getElementById('salePaidSum');
        const dueSum = document.getElementById('saleDueSum');
        const noticeCont = document.getElementById('saleSurplusNoticeContainer');

        if (paidSum) paidSum.innerText = `${paid.toFixed(2)} ₪`;
        if (dueSum) dueSum.innerText = `${due.toFixed(2)} ₪`;

        if (!noticeCont) return;

        if (surplus <= 0) {
            noticeCont.innerHTML = '';
            return;
        }

        const projId = document.getElementById('saleProj')?.value;
        const custNameInput = document.getElementById('saleCustName');
        const custName = (custNameInput && custNameInput.value.trim()) ? custNameInput.value.trim() : '';

        if (!custName || custName === 'عميل نقدي') {
            noticeCont.innerHTML = `
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:0.6rem 0.9rem; color:#166534; font-size:0.82rem; margin-top:0.75rem;">
                    <i class="fa-solid fa-circle-info text-success"></i> <strong>فائض دفع: +${surplus.toFixed(2)} ₪</strong> عن قيمة الفاتورة (عميل نقدي بدون ذمم).
                </div>
            `;
            return;
        }

        // جلب ديون العميل السابقة غير المسددة على هذا المشروع المفتوح فقط
        const curId = this.editingSaleId;
        const oldInvs = (AppState.salesInvoices || []).filter(s => 
            s.customerName === custName && 
            s.projectId === projId && 
            s.remainingDue > 0 && 
            s.id !== curId
        );
        const totalOldDue = oldInvs.reduce((sum, s) => sum + (s.remainingDue || 0), 0);
        const projName = this.getProjectName(projId);

        if (totalOldDue > 0) {
            const deducted = Math.min(surplus, totalOldDue);
            const remainingSurplus = parseFloat((surplus - deducted).toFixed(2));
            const remainingDebtAfter = Math.max(0, parseFloat((totalOldDue - deducted).toFixed(2)));

            noticeCont.innerHTML = `
                <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:8px; padding:0.75rem 1rem; color:#065f46; font-size:0.83rem; margin-top:0.75rem;">
                    <div style="font-weight:700; margin-bottom:4px; font-size:0.88rem;">
                        <i class="fa-solid fa-circle-check text-success"></i> فائض سداد: ${surplus.toFixed(2)} ₪
                    </div>
                    <div>
                        قيمة الفاتورة <strong>${total.toFixed(2)} ₪</strong> بينما المبلغ المقبوض <strong>${paid.toFixed(2)} ₪</strong>.
                    </div>
                    <div class="mt-1 pt-1 border-top" style="border-color:#a7f3d0 !important;">
                        <i class="fa-solid fa-arrow-down-long text-success"></i> 
                        سيتم خصم <strong>${deducted.toFixed(2)} ₪</strong> تلقائياً من ديون العميل السابقة في مشروع <strong>(${projName})</strong> فقط.
                        <br>
                        (ديون العميل السابقة بهذا المشروع: ${totalOldDue.toFixed(2)} ₪ ⬅️ المتبقي بعدها: <strong>${remainingDebtAfter.toFixed(2)} ₪</strong>)
                        ${remainingSurplus > 0 ? `<br><span class="text-primary"><i class="fa-solid fa-wallet"></i> يتبقى ${remainingSurplus.toFixed(2)} ₪ رصيد زائد بعد تصفير كامل ديون هذا المشروع.</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            noticeCont.innerHTML = `
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:0.6rem 0.9rem; color:#166534; font-size:0.82rem; margin-top:0.75rem;">
                    <i class="fa-solid fa-circle-info text-success"></i> <strong>فائض دفع: +${surplus.toFixed(2)} ₪</strong> عن قيمة الفاتورة. 
                    لا توجد ديون سابقة على العميل (${custName}) في هذا المشروع (${projName}).
                </div>
            `;
        }
    },

    saveSaleInvoice() {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه أمني: انقطع الاتصال بالإنترنت! تم منع حفظ الفاتورة لحماية المزامنة السحابية.');
            return;
        }
        if (!this.checkPermission('canViewSales')) {
            alert('⚠️ غير مصرح لك بإصدار أو تعديل فواتير المبيعات!');
            return;
        }

        if (this.saleItems.length === 0) {
            alert('الرجاء إضافة صنف واحد على الأقل للفاتورة.');
            return;
        }

        const projSelect = document.getElementById('saleProj');
        let projId = projSelect ? projSelect.value : '';
        if (this.currentUser && this.currentUser.role !== 'admin' && !this.currentUser.permissions?.canViewAllProjects) {
            projId = this.currentUser.assignedProject || projId;
        }

        const custNameInput = document.getElementById('saleCustName');
        const custName = (custNameInput && custNameInput.value.trim()) ? custNameInput.value.trim() : 'عميل نقدي';
        const tier = document.getElementById('saleTier')?.value || 'retail';

        const total = parseFloat(this.saleItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0).toFixed(2));
        const paid = parseFloat(this.paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0).toFixed(2));
        const due = Math.max(0, parseFloat((total - paid).toFixed(2)));
        const surplus = paid > total ? parseFloat((paid - total).toFixed(2)) : 0;

        // إذا كنا في وضع التعديل، نعكس أولاً الأثر القديم للفاتورة
        if (this.editingSaleId) {
            const oldInv = AppState.salesInvoices.find(s => s.id === this.editingSaleId);
            if (oldInv) this.reverseSaleInvoiceEffects(oldInv);
        }

        const invNum = this.editingSaleId 
            ? (AppState.salesInvoices.find(s => s.id === this.editingSaleId)?.invoiceNumber)
            : ('INV-S-' + (1000 + AppState.salesInvoices.length + 1));

        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

        // معالجة فائض السداد وخصمه تلقائياً من ديون العميل السابقة على هذا المشروع المفتوح فقط
        let surplusRemaining = surplus;
        const surplusDistribution = [];
        const alertDeductionLines = [];

        if (surplusRemaining > 0 && custName && custName !== 'عميل نقدي') {
            const currentSaleId = this.editingSaleId;
            // جلب فواتير العميل السابقة غير المسددة في هذا المشروع المفتوح حصراً (مرتبة من الأقدم للأحدث)
            const oldCustomerInvoices = (AppState.salesInvoices || [])
                .filter(s => 
                    s.customerName === custName && 
                    s.projectId === projId && 
                    s.remainingDue > 0 && 
                    s.id !== currentSaleId
                )
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            for (const oldInv of oldCustomerInvoices) {
                if (surplusRemaining <= 0) break;
                const deduction = Math.min(surplusRemaining, oldInv.remainingDue);
                const deductionFixed = parseFloat(deduction.toFixed(2));
                if (deductionFixed <= 0) continue;

                oldInv.remainingDue = parseFloat((oldInv.remainingDue - deductionFixed).toFixed(2));
                oldInv.paidAmount = parseFloat(((oldInv.paidAmount || 0) + deductionFixed).toFixed(2));
                if (oldInv.remainingDue <= 0) {
                    oldInv.status = 'completed';
                }

                if (!oldInv.surplusPaymentsReceived) oldInv.surplusPaymentsReceived = [];
                oldInv.surplusPaymentsReceived.push({
                    fromInvoice: invNum,
                    amount: deductionFixed,
                    date: now
                });

                surplusDistribution.push({
                    invoiceId: oldInv.id,
                    invoiceNumber: oldInv.invoiceNumber,
                    amount: deductionFixed
                });

                alertDeductionLines.push(`• خصم ${deductionFixed.toFixed(2)} ₪ من الفاتورة (${oldInv.invoiceNumber}) [المتبقي منها: ${oldInv.remainingDue.toFixed(2)} ₪]`);
                surplusRemaining = parseFloat((surplusRemaining - deductionFixed).toFixed(2));
            }
        }

        const invoiceData = {
            id: this.editingSaleId || ('inv_s_' + Date.now()),
            invoiceNumber: invNum,
            date: now,
            projectId: projId,
            customerId: '',
            customerName: custName,
            priceTier: tier,
            items: [...this.saleItems],
            totalAmount: total,
            paidAmount: paid,
            remainingDue: due,
            surplusAmount: surplus,
            surplusDistribution: surplusDistribution,
            payments: this.paymentRows
                .filter(p => (parseFloat(p.amount) || 0) > 0)
                .map(p => ({
                    method: p.method,
                    accountId: p.accountId,
                    amount: parseFloat(p.amount) || 0,
                    ref: (p.ref || '').trim()
                })),
            status: due <= 0 ? 'completed' : 'partial'
        };

        if (this.editingSaleId) {
            const idx = AppState.salesInvoices.findIndex(s => s.id === this.editingSaleId);
            if (idx !== -1) AppState.salesInvoices[idx] = invoiceData;
            this.editingSaleId = null;
        } else {
            AppState.salesInvoices.unshift(invoiceData);
        }

        // تسجيل اسم العميل محلياً في الذاكرة لتسهيل الإكمال التلقائي مستقبلاً
        if (custName && custName !== 'عميل نقدي') {
            if (!AppState.customers) AppState.customers = [];
            if (!AppState.customers.some(c => c.name === custName)) {
                AppState.customers.push({ id: 'c_' + Date.now(), name: custName });
            }
        }

        // تطبيق الأثر الجديد (مخزون وحسابات)
        this.saleItems.forEach(item => {
            const prod = AppState.products.find(p => p.id === item.productId);
            if (prod && !prod.isUnknownStock && prod.stock !== null && prod.stock !== undefined) {
                prod.stock = parseFloat(((parseFloat(prod.stock) || 0) - (parseFloat(item.qty) || 0)).toFixed(2));
            }
        });

        invoiceData.payments.forEach(p => {
            const acc = AppState.accounts.find(a => a.id === p.accountId);
            if (acc) {
                acc.balance = parseFloat(((parseFloat(acc.balance) || 0) + (parseFloat(p.amount) || 0)).toFixed(2));
                if (!acc.allocations) acc.allocations = {};
                acc.allocations[projId] = parseFloat(((parseFloat(acc.allocations[projId]) || 0) + (parseFloat(p.amount) || 0)).toFixed(2));
            }
        });

        this.saveState();
        this.closeModal('saleModal');
        this.renderAll();

        let successMsg = `✅ تم اعتماد وحفظ الفاتورة (${invNum}) بنجاح!`;
        if (surplus > 0 && alertDeductionLines.length > 0) {
            successMsg += `\n\n💰 تم توجيه فائض السداد (${surplus.toFixed(2)} ₪) تلقائياً لسداد ديون العميل السابقة في مشروع (${this.getProjectName(projId)}):\n` + alertDeductionLines.join('\n');
        }
        alert(successMsg);
    },

    printInvoice(invId) {
        const inv = AppState.salesInvoices.find(s => s.id === invId);
        if (!inv) return;

        const body = `
            <div style="padding: 1.5rem; border: 1px solid #ccc; font-family: 'Tajawal'; direction: rtl; text-align: right;">
                <div style="display:flex; justify-content:space-between; border-bottom:2px solid #2563eb; padding-bottom:0.5rem; margin-bottom:1rem;">
                    <div><h2>فاتورة مبيعات</h2><small>${this.getProjectName(inv.projectId)}</small></div>
                    <div style="text-align:left;"><strong>${inv.invoiceNumber}</strong><br><small>${inv.date}</small></div>
                </div>
                <p><strong>العميل:</strong> ${inv.customerName}</p>
                <table style="width:100%; border-collapse:collapse; margin:1rem 0;">
                    <thead><tr style="background:#f1f5f9; text-align:right;"><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>
                        ${(inv.items || []).map(it => `<tr><td>${it.name}</td><td>${it.qty}</td><td>${it.unitPrice.toFixed(2)} ₪</td><td>${it.total.toFixed(2)} ₪</td></tr>`).join('')}
                    </tbody>
                </table>
                <div style="display:flex; justify-content:space-between; background:#eff6ff; padding:0.75rem;">
                    <div>المدفوع: <strong>${inv.paidAmount.toFixed(2)} ₪</strong> | المتبقي: <strong>${inv.remainingDue.toFixed(2)} ₪</strong></div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#2563eb;">الإجمالي: ${inv.totalAmount.toFixed(2)} ₪</div>
                </div>
                <div style="margin-top:0.75rem; font-size:0.85rem; border-top:1px dashed #cbd5e1; padding-top:0.5rem;">
                    <strong>طرق التحصيل والمراجع:</strong>
                    ${(inv.payments || []).filter(p => p.amount > 0).map(p => {
                        const mNames = { bank: 'بنك فلسطين', wallet: 'محفظة PalPay', jawwal: 'جوال باي', cash: 'كاش' };
                        const ref = p.ref ? ` (مرجع/وصل: ${p.ref})` : '';
                        return `<div>• ${mNames[p.method] || p.method}: ${p.amount.toFixed(2)} ₪${ref}</div>`;
                    }).join('') || (inv.paidAmount <= 0 ? '<div>• آجل بالكامل (ذمة على العميل)</div>' : '')}
                </div>
            </div>
        `;
        const w = window.open('', '_blank');
        w.document.write(body);
        w.print();
    },

    /* ========================================================
       خاصية البيع وتوريد المخزون عبر الكيواركود والباركود (QR & POS Scanner)
       ======================================================== */
    cameraScannerInstance: null,

    playBeepSound(type = 'success') {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 tone
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.12);
            } else {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(280, ctx.currentTime);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.25);
            }
        } catch(e) {}
    },

    onSaleBarcodeScanned(code) {
        const c = (code || '').trim();
        if (!c) return;

        const projId = document.getElementById('saleProj')?.value || AppState.projects[0]?.id;
        const cLower = c.toLowerCase();

        // البحث عن المنتج في هذا المشروع بالكود أو الباركود أو الـ ID أو الاسم
        const prod = AppState.products.find(p => 
            p.projectId === projId && (
                (p.code && p.code.toLowerCase() === cLower) || 
                (p.barcode && p.barcode.toLowerCase() === cLower) || 
                p.id.toLowerCase() === cLower ||
                p.name.toLowerCase() === cLower
            )
        );

        if (prod) {
            this.playBeepSound('success');
            // تحديد السعر حسب الشريحة المختارة
            const tier = document.getElementById('saleTier')?.value || 'retail';
            let price = prod.retailPrice || 0;
            if (tier === 'semi_wholesale') price = prod.semiWholesalePrice || prod.retailPrice || 0;
            if (tier === 'wholesale') price = prod.wholesalePrice || prod.retailPrice || 0;

            const existingItem = this.saleItems.find(it => it.productId === prod.id);
            if (existingItem) {
                existingItem.qty = parseFloat((existingItem.qty + 1).toFixed(2));
                existingItem.total = parseFloat((existingItem.qty * existingItem.unitPrice).toFixed(2));
            } else {
                this.saleItems.push({
                    productId: prod.id,
                    name: prod.name,
                    qty: 1,
                    unitPrice: price,
                    total: price,
                    unit: prod.unit
                });
            }

            this.renderSaleItems();
            this.updatePaymentCalculations();

            const scanInput = document.getElementById('saleBarcodeScanInput');
            if (scanInput) {
                scanInput.placeholder = `✔️ أُضيف: ${prod.name}`;
                setTimeout(() => {
                    if (scanInput) scanInput.placeholder = "امسح كيواركود الصنف أو اكتب الكود واضغط Enter...";
                }, 2000);
            }
        } else {
            this.playBeepSound('error');
            alert(`⚠️ لم يتم العثور على صنف بالرمز "${c}" في هذا المشروع.\nتأكد من اختيار المشروع الصحيح أو تسجيل الصنف في المخزون.`);
        }
    },

    openInventoryScanModal() {
        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = `<i class="fa-solid fa-qrcode text-primary"></i> توريد وإضافة منتجات للمخزون عبر الكيواركود والباركود`;
        body.innerHTML = `
            <div class="p-3 rounded mb-3" style="background:var(--primary-soft); border:1px solid rgba(37,99,235,0.25);">
                <label class="form-label" style="font-weight:700; color:var(--primary);">
                    <i class="fa-solid fa-barcode"></i> امسح كيواركود الصنف أو الباركود بالجهاز:
                </label>
                <div class="d-flex gap-2">
                    <input type="text" id="invScanCodeInput" class="form-control" placeholder="امسح الكود أو اكتبه ثم اضغط Enter..." autofocus onkeydown="if(event.key==='Enter'){event.preventDefault(); App.onInventoryBarcodeScanned(this.value);}">
                    <button type="button" class="btn btn-primary" onclick="App.onInventoryBarcodeScanned(document.getElementById('invScanCodeInput').value)"><i class="fa-solid fa-search"></i> بحث</button>
                    <button type="button" class="btn btn-outline" onclick="App.openCameraQrScanner('inventoryModal')" title="تشغيل كاميرا مسح الكيواركود"><i class="fa-solid fa-camera"></i> كاميرا</button>
                </div>
            </div>

            <!-- حاوية عرض تفاصيل المنتج أو زر إضافته كصنف جديد -->
            <div id="invScanResultContainer">
                <div class="text-center py-4 text-muted" style="font-size:0.85rem;">
                    <i class="fa-solid fa-qrcode mb-2" style="font-size:2.5rem; display:block; opacity:0.35;"></i>
                    قم بمسح أي كيواركود أو باركود للمنتج لعرض رصيده فورياً وزيادة مخزونه أو تسجيله كمنتج جديد.
                </div>
            </div>
        `;

        submit.style.display = 'none';
        this.openModal('genericModal');
        setTimeout(() => {
            const input = document.getElementById('invScanCodeInput');
            if (input) input.focus();
        }, 100);
    },

    onInventoryBarcodeScanned(code) {
        const c = (code || '').trim();
        if (!c) {
            alert('الرجاء إدخال أو مسح كود الصنف أولاً.');
            return;
        }

        const input = document.getElementById('invScanCodeInput');
        if (input) input.value = c;

        const container = document.getElementById('invScanResultContainer');
        if (!container) return;

        const cLower = c.toLowerCase();
        // البحث عن المنتج بالكود أو الباركود أو الـ ID
        const prod = AppState.products.find(p => 
            (p.code && p.code.toLowerCase() === cLower) || 
            (p.barcode && p.barcode.toLowerCase() === cLower) || 
            p.id.toLowerCase() === cLower
        );

        if (prod) {
            this.playBeepSound('success');
            const bt = getProjectBusinessType(prod.projectId);
            const unit = prod.unit || bt.unitLabel || 'وحدة';
            const curStock = prod.isUnknownStock ? 'غير معروف (متاح دائماً)' : `${prod.stock || 0} ${unit}`;

            container.innerHTML = `
                <div class="card p-3 border" style="background:var(--bg-surface); border-radius:8px;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h4 style="margin:0; color:var(--primary); font-size:1.05rem;">
                            <i class="fa-solid fa-box-open"></i> ${prod.name}
                        </h4>
                        <span class="badge badge-blue">${this.getProjectName(prod.projectId)}</span>
                    </div>

                    <div class="grid-3 gap-2 mb-3" style="font-size:0.82rem;">
                        <div><strong>الكود:</strong> ${prod.code || prod.barcode || '-'}</div>
                        <div><strong>التصنيف:</strong> ${prod.category || 'عام'}</div>
                        <div><strong>سعر التكلفة:</strong> ${(prod.costPrice || 0).toFixed(2)} ₪</div>
                        <div><strong>سعر البيع:</strong> ${(prod.retailPrice || 0).toFixed(2)} ₪</div>
                        <div><strong>المخزون الحالي:</strong> <span class="badge badge-green font-bold">${curStock}</span></div>
                    </div>

                    <div class="p-3 rounded mb-2" style="background:#f0fdf4; border:1px solid #86efac;">
                        <label class="form-label font-bold text-success mb-1">
                            <i class="fa-solid fa-circle-plus"></i> إضافة كمية واردة إلى المخزون (${unit}):
                        </label>
                        <div class="d-flex gap-2">
                            <input type="number" id="invScanAddQty" class="form-control" value="10" min="0.1" step="1" autofocus style="font-size:1.1rem; font-weight:700;">
                            <button class="btn btn-primary" onclick="App.confirmAddStockViaScan('${prod.id}')" style="white-space:nowrap;">
                                <i class="fa-solid fa-save"></i> تحديث المخزون
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            this.playBeepSound('error');
            container.innerHTML = `
                <div class="p-3 rounded text-center border" style="background:#fffbeb; border-color:#fef3c7;">
                    <div style="font-size:1.6rem; color:#d97706; margin-bottom:0.5rem;">
                        <i class="fa-solid fa-circle-question"></i>
                    </div>
                    <h4 style="margin-bottom:0.4rem; color:#b45309;">منتج جديد غير مسجل في المخزون!</h4>
                    <p style="font-size:0.85rem; color:#78350f; margin-bottom:1rem;">
                        الكود الممسوح: <strong>${c}</strong> لا ينتمي لأي صنف مسجل حالياً.
                    </p>
                    <button class="btn btn-primary" onclick="App.openNewProductWithScannedCode('${c}')">
                        <i class="fa-solid fa-plus-circle"></i> إضافة هذا المنتج كصنف جديد في المخزون
                    </button>
                </div>
            `;
        }
    },

    confirmAddStockViaScan(prodId) {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! لا يمكن تحديث المخزون.');
            return;
        }
        if (!this.checkPermission('canManageInventory')) {
            alert('⚠️ غير مصرح لك بتحديث كميات المخزون!');
            return;
        }

        const prod = AppState.products.find(p => p.id === prodId);
        if (!prod) return;

        const qtyInput = document.getElementById('invScanAddQty');
        const qty = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
        if (qty <= 0) {
            alert('الرجاء إدخال كمية صحيحة أكبر من الصفر.');
            return;
        }

        if (prod.isUnknownStock) {
            prod.isUnknownStock = false;
            prod.stock = qty;
        } else {
            prod.stock = parseFloat(((prod.stock || 0) + qty).toFixed(2));
        }

        this.saveState();
        this.renderInventory();
        this.renderDashboard();
        this.playBeepSound('success');
        alert(`✅ تمت إضافة (${qty}) بنجاح إلى مخزون "${prod.name}". الرصيد الجديد: ${prod.stock}`);
        this.onInventoryBarcodeScanned(prod.code || prod.id);
    },

    openNewProductWithScannedCode(code) {
        this.closeModal('genericModal');
        setTimeout(() => {
            this.openProductModal();
            setTimeout(() => {
                const codeInput = document.getElementById('pmCode');
                if (codeInput) codeInput.value = code;
            }, 100);
        }, 150);
    },

    generateQrCodeForProduct() {
        const code = 'PRD-' + Date.now().toString().slice(-6);
        const codeInput = document.getElementById('pmCode');
        if (codeInput) {
            codeInput.value = code;
            this.playBeepSound('success');
            alert(`تم توليد كود تلقائي للصنف: ${code}`);
        }
    },

    openCameraQrScanner(target = 'sale') {
        if (typeof Html5Qrcode === 'undefined') {
            const code = prompt('أدخل أو الصق كود الكيوار كود / الباركود:');
            if (code) {
                if (target === 'sale') this.onSaleBarcodeScanned(code);
                else if (target === 'inventoryModal') this.onInventoryBarcodeScanned(code);
                else if (target === 'productModal') {
                    const el = document.getElementById('pmCode');
                    if (el) el.value = code;
                }
            }
            return;
        }

        let overlay = document.getElementById('cameraQrModalOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cameraQrModalOverlay';
            overlay.className = 'modal-overlay';
            overlay.style.zIndex = '99999';
            overlay.innerHTML = `
                <div class="modal-card" style="max-width:440px;">
                    <div class="modal-header">
                        <div class="modal-title"><i class="fa-solid fa-camera text-primary"></i> ماسح الكيواركود والباركود بالكاميرا</div>
                        <button class="modal-close" onclick="App.closeCameraQrScanner()">&times;</button>
                    </div>
                    <div class="modal-body text-center">
                        <div id="cameraQrReader" style="width:100%; border-radius:8px; overflow:hidden; background:#000; min-height:260px;"></div>
                        <p class="text-muted small mt-2 mb-0">وجه كاميرا الهاتف أو الحاسوب نحو الكيواركود أو الباركود</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="App.closeCameraQrScanner()">إلغاء وإغلاق</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        overlay.classList.add('active');

        try {
            if (this.cameraScannerInstance) {
                this.cameraScannerInstance.stop().catch(() => {}).finally(() => {
                    this.startHtml5Scanner(target);
                });
            } else {
                this.startHtml5Scanner(target);
            }
        } catch (err) {
            console.error('Camera QR start error:', err);
        }
    },

    startHtml5Scanner(target) {
        try {
            this.cameraScannerInstance = new Html5Qrcode("cameraQrReader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            this.cameraScannerInstance.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    this.playBeepSound('success');
                    this.closeCameraQrScanner();
                    if (target === 'sale') {
                        this.onSaleBarcodeScanned(decodedText);
                    } else if (target === 'inventoryModal') {
                        this.onInventoryBarcodeScanned(decodedText);
                    } else if (target === 'productModal') {
                        const el = document.getElementById('pmCode');
                        if (el) el.value = decodedText;
                    }
                },
                (errorMessage) => {}
            ).catch(err => {
                alert('تعذر فتح الكاميرا: ' + (err?.message || err) + '\nيمكنك كتابة الكود يدوياً أو استخدام جهاز الباركود.');
                this.closeCameraQrScanner();
            });
        } catch(e) {
            alert('تعذر تشغيل ماسح الكاميرا، يرجى كتابة الكود يدوياً.');
            this.closeCameraQrScanner();
        }
    },

    closeCameraQrScanner() {
        const overlay = document.getElementById('cameraQrModalOverlay');
        if (overlay) overlay.classList.remove('active');
        if (this.cameraScannerInstance) {
            try {
                this.cameraScannerInstance.stop().then(() => {
                    this.cameraScannerInstance.clear();
                    this.cameraScannerInstance = null;
                }).catch(() => {
                    this.cameraScannerInstance = null;
                });
            } catch(e) {
                this.cameraScannerInstance = null;
            }
        }
    },

    /* ========================================================
       4. المشتريات والتوريد (متكيف: مواد خام حرة / مخزون)
       ======================================================== */
    renderPurchases() {
        const tbody = document.getElementById('purchasesTableBody');
        if (!tbody) return;

        const purchases = this.filterProject(AppState.purchaseInvoices);
        tbody.innerHTML = purchases.map(p => {
            const bt = getProjectBusinessType(p.projectId);
            const itemsSummary = (p.items || []).map(it => {
                const unitStr = it.unit ? ` (${it.qty} ${it.unit})` : (it.qty ? ` (${it.qty})` : '');
                return `${it.name}${unitStr}`;
            }).join(' + ') || (p.isFree ? 'مواد خام' : 'بضاعة');

            const isFree = p.isFree !== undefined ? p.isFree : bt.freePurchase;

            const hasSurplusDeduction = p.surplusAmount > 0;
            const receivedSurplus = (p.surplusPaymentsReceived && p.surplusPaymentsReceived.length > 0)
                ? p.surplusPaymentsReceived.map(sp => `${sp.amount.toFixed(2)} ₪ من ${sp.fromInvoice}`).join('، ')
                : '';

            return `
            <tr>
                <td><strong>${p.invoiceNumber}</strong></td>
                <td>${p.date}</td>
                <td><span class="badge badge-blue"><i class="fa-solid ${bt.icon}"></i> ${this.getProjectName(p.projectId)}</span></td>
                <td><strong>${p.supplierName}</strong></td>
                <td>
                    ${isFree 
                        ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.72rem;"><i class="fa-solid fa-basket-shopping"></i> مادة خام / مصروف</span>` 
                        : `<span class="badge badge-blue" style="font-size:0.72rem;"><i class="fa-solid fa-box"></i> مخزون</span>`}
                    <div style="font-weight:700; font-size:0.85rem; margin-top:2px;">${itemsSummary}</div>
                </td>
                <td><strong class="text-primary">${p.totalAmount.toFixed(2)} ₪</strong></td>
                <td>
                    <strong class="text-success">${p.paidAmount.toFixed(2)} ₪</strong>
                    ${hasSurplusDeduction ? `<br><span class="badge" style="background:#ecfdf5; color:#059669; font-size:0.68rem; margin-top:2px;" title="تم خصم هذا المبلغ تلقائياً من ديون سابقة للمورد"><i class="fa-solid fa-arrow-down-long"></i> فائض مسدد للديون: +${p.surplusAmount.toFixed(2)} ₪</span>` : ''}
                    ${receivedSurplus ? `<br><span class="badge" style="background:#eff6ff; color:#1d4ed8; font-size:0.68rem; margin-top:2px;" title="سُدد جزء من هذه الفاتورة من فائض دفع"><i class="fa-solid fa-receipt"></i> سُدد من فائض: ${receivedSurplus}</span>` : ''}
                </td>
                <td><strong class="${p.remainingDue > 0 ? 'text-danger' : 'text-muted'}">${p.remainingDue.toFixed(2)} ₪</strong></td>
                <td>${p.remainingDue <= 0 ? '<span class="badge badge-green">مسددة</span>' : '<span class="badge badge-red">مستحق للمورد</span>'}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline" onclick="App.editPurchaseInvoice('${p.id}')" title="تعديل الفاتورة"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="App.deletePurchaseInvoice('${p.id}')" title="حذف الفاتورة"><i class="fa-solid fa-trash"></i></button>
                        <button class="btn btn-sm btn-outline" onclick="window.print()" title="طباعة"><i class="fa-solid fa-print"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="10" class="text-center py-4 text-muted">لا توجد فواتير مشتريات مسجلة</td></tr>';
    },

    openPurchaseModal(pInvId = null) {
        this.editingPurchaseId = pInvId;
        const isEdit = !!pInvId;
        const inv = isEdit ? AppState.purchaseInvoices.find(p => p.id === pInvId) : null;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const defaultProjId = isEmployee ? user.assignedProject : 
            (inv ? inv.projectId : (AppState.currentProject !== 'all' ? AppState.currentProject : AppState.projects[0]?.id || ''));
        const bt = getProjectBusinessType(defaultProjId);

        // هل الفاتورة مادة خام حرة أم توريد مخزون؟
        this.currentPurchaseIsFree = inv ? (inv.isFree !== undefined ? inv.isFree : bt.freePurchase) : bt.freePurchase;

        title.innerHTML = isEdit 
            ? `<i class="fa-solid fa-pen text-primary"></i> تعديل فاتورة شراء: ${inv.invoiceNumber}` 
            : `<i class="fa-solid fa-cart-flatbed text-primary"></i> تسجيل فاتورة مشتريات وتوريد`;

        const curItem = (inv && inv.items && inv.items[0]) || null;
        const suppliersForProj = this.getSuppliersForProject(defaultProjId);

        body.innerHTML = `
            <div class="grid-2 mb-3">
                <div class="form-group">
                    <label class="form-label">المشروع المستفيد:</label>
                    <select id="purProj" class="form-control" onchange="App.onPurProjChange()" ${isEmployee ? 'disabled' : ''}>
                        ${isEmployee 
                            ? `<option value="${user.assignedProject}">🏢 ${this.getProjectName(user.assignedProject)} (مشروعك المخصص)</option>`
                            : AppState.projects.map(p => {
                                const pbt = BUSINESS_TYPES[p.businessType] || BUSINESS_TYPES.other;
                                return `<option value="${p.id}" ${p.id === defaultProjId ? 'selected' : ''}>${p.name} (${pbt.label})</option>`;
                            }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="form-label mb-0">المورد:</label>
                        <div class="d-flex gap-2">
                            <a href="javascript:void(0)" onclick="App.openContactModal('supplier')" style="font-size:0.78rem; text-decoration:none; font-weight:700;"><i class="fa-solid fa-plus"></i> إضافة مورد</a>
                            <span class="text-muted">|</span>
                            <a href="javascript:void(0)" onclick="App.deleteCurrentSupplierFromModal()" class="text-danger" style="font-size:0.78rem; text-decoration:none; font-weight:700;" title="أيقونة مسح المورد بعد الحفظ"><i class="fa-solid fa-trash-can"></i> مسح المورد</a>
                        </div>
                    </div>
                    <select id="purSupp" class="form-control" onchange="App.onPurPaidOrTotalChange()">
                        ${suppliersForProj && suppliersForProj.length > 0 
                            ? suppliersForProj.map(s => `<option value="${s.id}" ${inv && inv.supplierId === s.id ? 'selected' : ''}>${s.name}</option>`).join('') 
                            : '<option value="">-- مورد نقدي / مباشر --</option>'}
                    </select>
                </div>
            </div>

            <!-- حاوية تفاصيل الصنف/المادة الخام المتكيفة -->
            <div id="purDynamicItemContainer" class="mb-3"></div>

            <div class="grid-2 mb-2">
                <div class="form-group">
                    <label class="form-label">الحساب المشترك للسداد:</label>
                    <select id="purAcc" class="form-control">
                        <option value="">آجل بالكامل على حساب المورد</option>
                        ${AppState.accounts.map(a => `<option value="${a.id}" ${(inv ? inv.accountId === a.id : a.isPrimary) ? 'selected' : ''}>${a.name} (رصيد: ${a.balance.toFixed(2)}₪)${a.isPrimary ? ' ⭐ الحساب الأولي' : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">المبلغ المسدد الآن (₪):</label>
                    <input type="number" id="purPaid" class="form-control" step="0.01" value="${inv ? inv.paidAmount : 0}" oninput="App.onPurPaidOrTotalChange()">
                </div>
            </div>

            <!-- إشعار تلقائي ذكي عند وجود فائض دفع لسداد ديون المورد السابقة -->
            <div id="purSurplusNoticeContainer" class="mb-3"></div>
        `;

        this.renderPurchaseDynamicItemFields(curItem);
        this.onPurPaidOrTotalChange();

        submit.style.display = 'inline-flex';
        submit.innerText = isEdit ? 'حفظ التعديلات' : 'اعتماد وحفظ الفاتورة';
        submit.onclick = () => this.savePurchaseInvoice();

        this.openModal('genericModal');
    },

    onPurPaidOrTotalChange() {
        const qty = parseFloat(document.getElementById('purQty')?.value) || 0;
        const price = parseFloat(document.getElementById('purPrice')?.value) || 0;
        const paid = parseFloat(document.getElementById('purPaid')?.value) || 0;
        const suppId = document.getElementById('purSupp')?.value;
        const container = document.getElementById('purSurplusNoticeContainer');
        if (!container) return;

        const total = parseFloat((qty * price).toFixed(2));
        const surplus = paid > total ? parseFloat((paid - total).toFixed(2)) : 0;

        if (surplus <= 0) {
            container.innerHTML = '';
            return;
        }

        const supp = AppState.suppliers.find(s => s.id === suppId);
        const suppName = supp ? supp.name : 'المورد المختار';
        const curInvId = this.editingPurchaseId;
        
        // جلب الفواتير السابقة غير المسددة لهذا المورد
        const oldInvs = (AppState.purchaseInvoices || []).filter(p => p.supplierId === suppId && p.remainingDue > 0 && p.id !== curInvId);
        const totalInvsDue = oldInvs.reduce((sum, p) => sum + (p.remainingDue || 0), 0);
        
        let totalSuppBal = 0;
        if (supp && supp.balances) {
            totalSuppBal = Object.values(supp.balances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        }
        const effectiveOldDebt = Math.max(totalInvsDue, totalSuppBal);

        if (effectiveOldDebt > 0) {
            const deducted = Math.min(surplus, effectiveOldDebt);
            const remainingSurplus = parseFloat((surplus - deducted).toFixed(2));
            const remainingDebtAfter = Math.max(0, parseFloat((effectiveOldDebt - deducted).toFixed(2)));

            container.innerHTML = `
                <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:8px; padding:0.75rem 1rem; color:#065f46; font-size:0.83rem;">
                    <div style="font-weight:700; margin-bottom:4px; font-size:0.88rem;">
                        <i class="fa-solid fa-circle-check text-success"></i> فائض سداد: ${surplus.toFixed(2)} ₪
                    </div>
                    <div>
                        قيمة الفاتورة <strong>${total.toFixed(2)} ₪</strong> والمبلغ المدفوع <strong>${paid.toFixed(2)} ₪</strong>.
                    </div>
                    <div class="mt-1 pt-1 border-top" style="border-color:#a7f3d0 !important;">
                        <i class="fa-solid fa-arrow-down-long text-success"></i> 
                        سيتم خصم <strong>${deducted.toFixed(2)} ₪</strong> تلقائياً من ديون <strong>${suppName}</strong> السابقة 
                        (الديون السابقة: ${effectiveOldDebt.toFixed(2)} ₪ ⬅️ المتبقي بعدها: <strong>${remainingDebtAfter.toFixed(2)} ₪</strong>).
                        ${remainingSurplus > 0 ? `<br><span class="text-primary"><i class="fa-solid fa-wallet"></i> يتبقى ${remainingSurplus.toFixed(2)} ₪ تقيد كرصيد دائن لصالح المحل لدى المورد.</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:0.75rem 1rem; color:#166534; font-size:0.83rem;">
                    <div style="font-weight:700; margin-bottom:4px;">
                        <i class="fa-solid fa-circle-info text-success"></i> فائض سداد: +${surplus.toFixed(2)} ₪
                    </div>
                    <div>
                        المبلغ المدفوع (${paid.toFixed(2)} ₪) يزيد عن قيمة الفاتورة (${total.toFixed(2)} ₪).
                        لا توجد ديون سابقة على ${suppName}، سيتم تقييد الفائض رصيداً دائناً لصالح المحل.
                    </div>
                </div>
            `;
        }
    },

    togglePurchaseMode() {
        this.currentPurchaseIsFree = !this.currentPurchaseIsFree;
        this.renderPurchaseDynamicItemFields();
    },

    onPurProjChange() {
        const pId = document.getElementById('purProj').value;
        const bt = getProjectBusinessType(pId);
        // التكيف التلقائي مع نوع المشروع
        this.currentPurchaseIsFree = bt.freePurchase;
        this.renderPurchaseDynamicItemFields();

        // تحديث قائمة الموردين التابعين لهذا المشروع
        const suppSelect = document.getElementById('purSupp');
        if (suppSelect) {
            const suppliers = this.getSuppliersForProject(pId);
            suppSelect.innerHTML = suppliers && suppliers.length > 0
                ? suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
                : '<option value="">-- مورد نقدي / مباشر --</option>';
        }
        this.onPurPaidOrTotalChange();
    },

    renderPurchaseDynamicItemFields(curItem = null) {
        const container = document.getElementById('purDynamicItemContainer');
        if (!container) return;

        const pId = document.getElementById('purProj')?.value || AppState.projects[0]?.id;
        const bt = getProjectBusinessType(pId);
        const isFree = this.currentPurchaseIsFree;

        if (isFree) {
            // نمط المشتريات الحرة والمواد الخام للمطاعم والإنتاج والخدمات
            const rawUnits = ['كيلو', 'شوال', 'كرتون', 'لتر', 'تنكة', 'حبة', 'ربطة', 'باكيت', 'علبة', 'طن', 'متر', 'خدمة', 'وحدة', 'custom'];
            const curUnit = (curItem && curItem.unit) || bt.unitLabel || 'كيلو';

            container.innerHTML = `
                <div style="background:var(--bg-surface); border-radius:8px; padding:1rem; border-right:4px solid #f59e0b;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <strong style="color:#b45309; font-size:0.9rem;">
                            <i class="fa-solid fa-basket-shopping"></i> مشتريات مواد خام / مصاريف حرة
                        </strong>
                        <button type="button" class="btn btn-sm btn-outline" onclick="App.togglePurchaseMode()" style="font-size:0.75rem; padding:2px 8px;">
                            <i class="fa-solid fa-arrows-rotate"></i> التبديل لتوريد مخزون
                        </button>
                    </div>

                    <div class="p-2 mb-3 rounded" style="background:#fef3c7; color:#92400e; font-size:0.78rem;">
                        <i class="fa-solid fa-lightbulb"></i> <strong>المواد الخام والمصاريف:</strong> يمكنك كتابة أي مادة تشترى يدوياً بحرية (بطاطا، حمص، غاز...). تسجل كتكلفة للمشروع ولا تخلط مع أصناف المبيعات (الفلافل/الفراشيح).
                    </div>

                    <div class="form-group mb-2">
                        <label class="form-label">وصف ما تم شراؤه (مادة خام أو مستلزم): <span class="text-danger">*</span></label>
                        <input type="text" id="purFreeName" class="form-control" 
                            value="${curItem ? curItem.name : ''}" 
                            placeholder="اكتب يدوياً: بطاطا، حمص، زيت، طحينة، غاز، أو أي مادة أو مصروف...">
                    </div>

                    <div class="grid-3 mb-0">
                        <div class="form-group">
                            <label class="form-label">الكمية:</label>
                            <input type="number" id="purQty" class="form-control" min="0.01" step="0.1" value="${curItem ? curItem.qty : 10}" oninput="App.onPurPaidOrTotalChange()">
                        </div>
                        <div class="form-group">
                            <label class="form-label">الوحدة:</label>
                            <select id="purFreeUnit" class="form-control" onchange="App.onPurFreeUnitChange()">
                                ${rawUnits.map(u => u === 'custom' 
                                    ? `<option value="custom">✏️ إدخال يدوي للوحدة...</option>` 
                                    : `<option value="${u}" ${u === curUnit ? 'selected' : ''}>${u}</option>`).join('')}
                            </select>
                            <input type="text" id="purFreeUnitCustom" class="form-control mt-1" style="display:none;" placeholder="اكتب الوحدة يدوياً (مثال: شوال 50كغم)">
                        </div>
                        <div class="form-group">
                            <label class="form-label">سعر الوحدة (₪):</label>
                            <input type="number" id="purPrice" class="form-control" step="0.01" value="${curItem ? curItem.unitPrice : 5}" oninput="App.onPurPaidOrTotalChange()">
                        </div>
                    </div>
                </div>
            `;
        } else {
            // نمط المشتريات المرتبطة بالمخزون للتجارة والمحلات
            const prods = AppState.products.filter(p => p.projectId === pId);
            container.innerHTML = `
                <div style="background:var(--bg-surface); border-radius:8px; padding:1rem; border-right:4px solid var(--primary);">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <strong style="color:var(--primary); font-size:0.9rem;">
                            <i class="fa-solid fa-box"></i> توريد أصناف للمخزون
                        </strong>
                        <button type="button" class="btn btn-sm btn-outline" onclick="App.togglePurchaseMode()" style="font-size:0.75rem; padding:2px 8px;">
                            <i class="fa-solid fa-arrows-rotate"></i> التبديل لمادة خام حرة
                        </button>
                    </div>

                    <div class="form-group mb-2">
                        <label class="form-label">اختر الصنف من المخزون أو أدخل يدوياً: <span class="text-danger">*</span></label>
                        <select id="purProd" class="form-control" onchange="App.onPurProdSelectChanged()">
                            ${prods.map(p => {
                                const unit = p.unit || bt.unitLabel;
                                return `<option value="${p.id}" data-cost="${p.costPrice}" data-unit="${unit}">
                                    ${p.name} (المخزون الحالي: ${p.stock} ${unit} - التكلفة: ${p.costPrice.toFixed(2)}₪)
                                </option>`;
                            }).join('')}
                            <option value="__custom_manual__">✏️ إدخال صنف يدوياً (غير مسجل في المخزون)...</option>
                        </select>
                        <div id="purManualProdWrapper" class="mt-2" style="display:none;">
                            <label class="form-label text-primary">اسم الصنف اليدوي:</label>
                            <input type="text" id="purManualProdName" class="form-control" placeholder="اكتب اسم الصنف يدوياً...">
                        </div>
                    </div>

                    <div class="grid-2 mb-0">
                        <div class="form-group">
                            <label class="form-label" id="purQtyLabel">الكمية المشتراة (${bt.unitLabel}):</label>
                            <input type="number" id="purQty" class="form-control" min="0.1" step="1" value="${curItem ? curItem.qty : 10}" oninput="App.onPurPaidOrTotalChange()">
                        </div>
                        <div class="form-group">
                            <label class="form-label">سعر شراء الوحدة (₪):</label>
                            <input type="number" id="purPrice" class="form-control" step="0.01" value="${curItem ? curItem.unitPrice : 0}" oninput="App.onPurPaidOrTotalChange()">
                        </div>
                    </div>
                </div>
            `;
            this.onPurProdSelectChanged();
            if (curItem && curItem.productId) {
                const sel = document.getElementById('purProd');
                if (sel) sel.value = curItem.productId;
            }
        }
    },

    setPurFreeName(name) {
        const input = document.getElementById('purFreeName');
        if (input) {
            input.value = name;
            input.focus();
        }
    },

    onPurFreeUnitChange() {
        const sel = document.getElementById('purFreeUnit');
        const customInput = document.getElementById('purFreeUnitCustom');
        if (!sel || !customInput) return;
        if (sel.value === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
        }
    },

    onPurProdSelectChanged() {
        const sel = document.getElementById('purProd');
        const priceInput = document.getElementById('purPrice');
        const manualWrapper = document.getElementById('purManualProdWrapper');
        if (!sel) return;

        if (sel.value === '__custom_manual__') {
            if (manualWrapper) manualWrapper.style.display = 'block';
            const manualInput = document.getElementById('purManualProdName');
            if (manualInput) manualInput.focus();
            return;
        } else {
            if (manualWrapper) manualWrapper.style.display = 'none';
        }

        if (!priceInput || !sel.options[sel.selectedIndex]) return;
        const opt = sel.options[sel.selectedIndex];
        const cost = parseFloat(opt.getAttribute('data-cost')) || 0;
        if (!priceInput.value || parseFloat(priceInput.value) === 0) {
            priceInput.value = cost;
        }
        this.onPurPaidOrTotalChange();
    },

    savePurchaseInvoice() {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه أمني: انقطع الاتصال بالإنترنت! تم منع حفظ فاتورة المشتريات.');
            return;
        }
        if (!this.checkPermission('canViewPurchases')) {
            alert('⚠️ غير مصرح لك بحفظ أو تعديل فواتير المشتريات والتوريد!');
            return;
        }

        const isEdit = !!this.editingPurchaseId;
        const inv = isEdit ? AppState.purchaseInvoices.find(p => p.id === this.editingPurchaseId) : null;

        const pId = document.getElementById('purProj').value;
        const suppId = document.getElementById('purSupp').value;
        const supp = AppState.suppliers.find(s => s.id === suppId);
        const qty = parseFloat(document.getElementById('purQty').value) || 1;
        const price = parseFloat(document.getElementById('purPrice').value) || 0;
        const accId = document.getElementById('purAcc').value;
        const paid = parseFloat(document.getElementById('purPaid').value) || 0;

        const total = parseFloat((qty * price).toFixed(2));
        const due = Math.max(0, parseFloat((total - paid).toFixed(2)));
        const surplus = paid > total ? parseFloat((paid - total).toFixed(2)) : 0;
        const isFree = this.currentPurchaseIsFree;

        let itemName = '';
        let productId = '';
        let unit = '';

        if (isFree) {
            // مشتريات مواد خام حرة (بدون ربط بالمخزون)
            itemName = (document.getElementById('purFreeName')?.value || '').trim();
            const unitSel = document.getElementById('purFreeUnit')?.value;
            const customUnit = (document.getElementById('purFreeUnitCustom')?.value || '').trim();
            unit = (unitSel === 'custom' && customUnit) ? customUnit : (unitSel || 'كيلو');

            if (!itemName) {
                alert('الرجاء كتابة وصف المادة المشتراة (مثل: بطاطا، حمص، زيت...).');
                return;
            }
        } else {
            // توريد بضاعة للمخزون
            const prodSelect = document.getElementById('purProd');
            productId = prodSelect ? prodSelect.value : '';

            if (productId === '__custom_manual__') {
                // إدخال صنف يدوي غير مسجل بالمخزون
                itemName = (document.getElementById('purManualProdName')?.value || '').trim();
                if (!itemName) {
                    alert('الرجاء كتابة اسم الصنف اليدوي.');
                    return;
                }
                productId = '';
                unit = getProjectBusinessType(pId).unitLabel || 'قطعة';
            } else {
                const prod = AppState.products.find(p => p.id === productId);
                if (!prod) {
                    alert('الرجاء اختيار صنف مسجل في المخزون أو إدخاله يدوياً.');
                    return;
                }
                itemName = prod.name;
                unit = prod.unit || getProjectBusinessType(pId).unitLabel;
            }
        }

        // في حال التعديل، نعكس الأثر المالي والمخزني وسداد الفائض القديم أولاً
        if (isEdit && inv) {
            this.reversePurchaseInvoiceEffects(inv);
        }

        // تطبيق التحديث المخزني للصنف إذا لم يكن مادة خام حرة ولم يكن غير محدد الكمية
        if (!isFree && productId) {
            const prod = AppState.products.find(p => p.id === productId);
            if (prod && !prod.isUnknownStock) {
                const oldTotalCost = (prod.stock || 0) * (prod.costPrice || 0);
                const newTotalCost = oldTotalCost + total;
                const totalQty = (prod.stock || 0) + qty;
                prod.costPrice = totalQty > 0 ? parseFloat((newTotalCost / totalQty).toFixed(2)) : price;
                prod.stock = totalQty;
            }
        }

        // تطبيق الخصم من الحساب المالي
        if (paid > 0 && accId) {
            const acc = AppState.accounts.find(a => a.id === accId);
            if (acc) {
                acc.balance = parseFloat((acc.balance - paid).toFixed(2));
                if (!acc.allocations) acc.allocations = {};
                acc.allocations[pId] = parseFloat(((acc.allocations[pId] || 0) - paid).toFixed(2));
            }
        }

        // تطبيق ذمة المورد لهذه الفاتورة إذا كان هناك متبقي
        if (due > 0 && supp) {
            if (!supp.balances) supp.balances = {};
            supp.balances[pId] = parseFloat(((supp.balances[pId] || 0) + due).toFixed(2));
        }

        // معالجة فائض السداد وخصمه تلقائياً من ديون المورد السابقة
        let surplusRemaining = surplus;
        const surplusDistribution = [];
        const alertDeductionLines = [];
        const invNum = isEdit ? inv.invoiceNumber : ('INV-P-' + (1000 + AppState.purchaseInvoices.length + 1));
        const now = new Date().toISOString().slice(0, 10);

        if (surplusRemaining > 0 && suppId) {
            const currentInvId = isEdit && inv ? inv.id : null;
            // جلب فواتير المشتريات السابقة غير المسددة لنفس المورد (من الأقدم للأحدث)
            const unpaidOldInvoices = (AppState.purchaseInvoices || [])
                .filter(p => p.supplierId === suppId && p.remainingDue > 0 && p.id !== currentInvId)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            for (const oldInv of unpaidOldInvoices) {
                if (surplusRemaining <= 0) break;
                const deduction = Math.min(surplusRemaining, oldInv.remainingDue);
                const deductionFixed = parseFloat(deduction.toFixed(2));
                if (deductionFixed <= 0) continue;

                oldInv.remainingDue = parseFloat((oldInv.remainingDue - deductionFixed).toFixed(2));
                oldInv.paidAmount = parseFloat(((oldInv.paidAmount || 0) + deductionFixed).toFixed(2));
                if (oldInv.remainingDue <= 0) {
                    oldInv.status = 'completed';
                }

                // تخفيض ذمة المورد لمشروع الفاتورة القديمة
                const oldProj = oldInv.projectId || pId;
                if (supp && supp.balances) {
                    supp.balances[oldProj] = parseFloat(((supp.balances[oldProj] || 0) - deductionFixed).toFixed(2));
                }

                if (!oldInv.surplusPaymentsReceived) oldInv.surplusPaymentsReceived = [];
                oldInv.surplusPaymentsReceived.push({
                    fromInvoice: invNum,
                    amount: deductionFixed,
                    date: now
                });

                surplusDistribution.push({
                    invoiceId: oldInv.id,
                    invoiceNumber: oldInv.invoiceNumber,
                    projectId: oldProj,
                    amount: deductionFixed
                });

                alertDeductionLines.push(`• خصم ${deductionFixed.toFixed(2)} ₪ من الفاتورة (${oldInv.invoiceNumber}) [المتبقي منها: ${oldInv.remainingDue.toFixed(2)} ₪]`);
                surplusRemaining = parseFloat((surplusRemaining - deductionFixed).toFixed(2));
            }

            // إذا تبقى جزء من الفائض وكان للمورد رصيد ذمة عام في supp.balances
            if (surplusRemaining > 0 && supp && supp.balances) {
                for (const projKey of Object.keys(supp.balances)) {
                    if (surplusRemaining <= 0) break;
                    if (supp.balances[projKey] > 0) {
                        const balDeduct = Math.min(surplusRemaining, supp.balances[projKey]);
                        const balDeductFixed = parseFloat(balDeduct.toFixed(2));
                        supp.balances[projKey] = parseFloat((supp.balances[projKey] - balDeductFixed).toFixed(2));
                        surplusDistribution.push({
                            supplierBalanceOnly: true,
                            projectId: projKey,
                            amount: balDeductFixed
                        });
                        alertDeductionLines.push(`• خصم ${balDeductFixed.toFixed(2)} ₪ من رصيد ذمة المورد`);
                        surplusRemaining = parseFloat((surplusRemaining - balDeductFixed).toFixed(2));
                    }
                }
            }

            // إذا كان الفائض أكبر من جميع الديون، يسجل الباقي كرصيد دائن للمحل لدى المورد
            if (surplusRemaining > 0 && supp) {
                if (!supp.balances) supp.balances = {};
                supp.balances[pId] = parseFloat(((supp.balances[pId] || 0) - surplusRemaining).toFixed(2));
                surplusDistribution.push({
                    advanceCredit: true,
                    projectId: pId,
                    amount: surplusRemaining
                });
                alertDeductionLines.push(`• قيد ${surplusRemaining.toFixed(2)} ₪ كرصيد دائن لصالح المحل لدى المورد`);
            }
        }

        const purchaseData = {
            id: isEdit ? inv.id : ('inv_p_' + Date.now()),
            invoiceNumber: invNum,
            date: now,
            projectId: pId,
            supplierId: suppId,
            supplierName: supp ? supp.name : (suppId ? 'مورد' : 'مورد نقدي'),
            isFree: isFree,
            items: [{ productId: productId, name: itemName, qty, unit, unitPrice: price, total }],
            totalAmount: total,
            paidAmount: paid,
            remainingDue: due,
            surplusAmount: surplus,
            surplusDistribution: surplusDistribution,
            accountId: accId,
            status: due <= 0 ? 'completed' : 'partial'
        };

        if (isEdit) {
            const idx = AppState.purchaseInvoices.findIndex(p => p.id === inv.id);
            if (idx !== -1) AppState.purchaseInvoices[idx] = purchaseData;
            this.editingPurchaseId = null;
        } else {
            AppState.purchaseInvoices.unshift(purchaseData);
        }

        this.saveState();
        this.closeModal('genericModal');
        this.renderAll();

        let successMsg = `✅ تم حفظ فاتورة الشراء (${invNum}) بنجاح!`;
        if (surplus > 0 && alertDeductionLines.length > 0) {
            successMsg += `\n\n💰 تم توجيه فائض السداد (${surplus.toFixed(2)} ₪) تلقائياً كالتالي:\n` + alertDeductionLines.join('\n');
        }
        alert(successMsg);
    },

    editPurchaseInvoice(pId) {
        this.openPurchaseModal(pId);
    },

    deletePurchaseInvoice(invId) {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! لا يمكن حذف فواتير المشتريات.');
            return;
        }
        if (this.currentUser?.role !== 'admin') {
            alert('⚠️ حذف فواتير المشتريات مخصص للمدير العام فقط!');
            return;
        }

        const inv = AppState.purchaseInvoices.find(p => p.id === invId);
        if (!inv) return;

        const confirmMsg = inv.isFree 
            ? `هل أنت متأكد من حذف فاتورة الشراء (${inv.invoiceNumber})؟\nسيتم عكس أثر المبالغ المالية للحساب المالي والمورد دون التأثير على المخزون.`
            : `هل أنت متأكد من حذف فاتورة الشراء (${inv.invoiceNumber})؟\nسيتم خصم الكميات من المخزن وإرجاع المبالغ للحساب المالي.`;

        if (!confirm(confirmMsg)) return;

        this.reversePurchaseInvoiceEffects(inv);
        AppState.purchaseInvoices = AppState.purchaseInvoices.filter(p => p.id !== invId);

        this.saveState();
        this.renderAll();
        alert(`تم حذف فاتورة الشراء ${inv.invoiceNumber} بنجاح.`);
    },

    reversePurchaseInvoiceEffects(inv) {
        // 1. خصم الكميات من المخزن فقط إذا لم تكن مادة خام حرة
        if (!inv.isFree) {
            (inv.items || []).forEach(it => {
                if (it.productId) {
                    const prod = AppState.products.find(p => p.id === it.productId);
                    if (prod && !prod.isUnknownStock) prod.stock -= it.qty;
                }
            });
        }

        // 2. إعادة المبلغ المدفوع للحساب المالي
        if (inv.paidAmount > 0 && inv.accountId) {
            const acc = AppState.accounts.find(a => a.id === inv.accountId);
            if (acc) {
                acc.balance = parseFloat((acc.balance + inv.paidAmount).toFixed(2));
                if (acc.allocations && acc.allocations[inv.projectId]) {
                    acc.allocations[inv.projectId] = parseFloat((acc.allocations[inv.projectId] + inv.paidAmount).toFixed(2));
                }
            }
        }

        // 3. تخفيض ذمة المورد الناتجة عن هذه الفاتورة
        if (inv.remainingDue > 0 && inv.supplierId) {
            const supp = AppState.suppliers.find(s => s.id === inv.supplierId);
            if (supp && supp.balances && supp.balances[inv.projectId] !== undefined) {
                supp.balances[inv.projectId] = parseFloat((supp.balances[inv.projectId] - inv.remainingDue).toFixed(2));
            }
        }

        // 4. عكس أثر توزيع الفائض على الفواتير القديمة وذمم المورد
        if (inv.surplusDistribution && Array.isArray(inv.surplusDistribution)) {
            const supp = AppState.suppliers.find(s => s.id === inv.supplierId);
            inv.surplusDistribution.forEach(dist => {
                if (dist.invoiceId) {
                    const oldInv = AppState.purchaseInvoices.find(p => p.id === dist.invoiceId);
                    if (oldInv) {
                        oldInv.remainingDue = parseFloat(((oldInv.remainingDue || 0) + dist.amount).toFixed(2));
                        oldInv.paidAmount = Math.max(0, parseFloat(((oldInv.paidAmount || 0) - dist.amount).toFixed(2)));
                        oldInv.status = oldInv.remainingDue <= 0 ? 'completed' : 'partial';
                        if (oldInv.surplusPaymentsReceived) {
                            oldInv.surplusPaymentsReceived = oldInv.surplusPaymentsReceived.filter(sp => sp.fromInvoice !== inv.invoiceNumber);
                        }
                    }
                }
                const targetProj = dist.projectId || inv.projectId;
                if (supp && supp.balances && supp.balances[targetProj] !== undefined) {
                    supp.balances[targetProj] = parseFloat((supp.balances[targetProj] + dist.amount).toFixed(2));
                }
            });
        }
    },

    /* ========================================================
       5. المخزون والأصناف (Inventory) - متكيف مع نوع النشاط التجاري
       ======================================================== */
    renderInventory(searchTerm = '') {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        let prods = this.filterProject(AppState.products);
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            prods = prods.filter(p => p.name.toLowerCase().includes(term) || (p.code && p.code.toLowerCase().includes(term)));
        }

        tbody.innerHTML = prods.map(p => {
            const bt = getProjectBusinessType(p.projectId);
            const unit = p.unit || bt.unitLabel;
            const hasStock = bt.hasStock;

            return `
            <tr>
                ${bt.hasBarcode ? `<td><strong>${p.code || '-'}</strong><br><small class="text-muted">${p.barcode || '-'}</small></td>` : `<td><strong>${p.code || '-'}</strong></td>`}
                <td>
                    <strong>${p.name}</strong><br>
                    <span class="badge badge-blue">${p.category || 'عام'}</span>
                    ${p.unit ? `<span class="badge" style="background:var(--bg-surface); color:var(--text-muted); font-size:0.7rem; margin-right:2px;">/ ${p.unit}</span>` : ''}
                </td>
                <td><span class="badge badge-blue"><i class="fa-solid ${bt.icon}"></i> ${this.getProjectName(p.projectId)}</span></td>
                <td><strong class="text-danger">${p.costPrice.toFixed(2)} ₪</strong></td>
                <td>${p.retailPrice.toFixed(2)} ₪</td>
                ${bt.hasPriceTiers ? `
                    <td>${p.semiWholesalePrice ? p.semiWholesalePrice.toFixed(2) + ' ₪' : '-'}</td>
                    <td><strong class="text-success">${p.wholesalePrice ? p.wholesalePrice.toFixed(2) + ' ₪' : '-'}</strong></td>
                ` : `<td colspan="2" class="text-muted" style="font-size:0.78rem;">— لا شرائح سعر</td>`}
                ${hasStock 
                    ? (p.isUnknownStock || p.stock === null || p.stock === undefined || p.stock === 'unknown'
                        ? `<td><span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:0.75rem;"><i class="fa-solid fa-infinity"></i> غير معروف</span></td>`
                        : `<td><strong class="text-primary">${p.stock} ${unit}</strong></td>`)
                    : `<td><span class="text-muted">—</span></td>`}
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline" onclick="App.openProductModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="9" class="text-center py-4 text-muted">لا توجد أصناف مسجلة في المخزن</td></tr>';
    },

    openProductModal(prodId = null) {
        const isEdit = !!prodId;
        const prod = isEdit ? AppState.products.find(p => p.id === prodId) : null;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const defaultProjId = isEmployee ? user.assignedProject : 
            (prod ? prod.projectId : (AppState.currentProject !== 'all' ? AppState.currentProject : AppState.projects[0]?.id));
        const bt = getProjectBusinessType(defaultProjId);

        title.innerHTML = isEdit 
            ? `<i class="fa-solid fa-pen text-primary"></i> تعديل صنف: ${prod.name}` 
            : `<i class="fa-solid fa-plus text-primary"></i> إضافة صنف / منتج جديد`;

        const projOptions = isEmployee
            ? `<option value="${user.assignedProject}">🏢 ${this.getProjectName(user.assignedProject)} (مشروعك المخصص)</option>`
            : AppState.projects.map(p => {
                const pbt = BUSINESS_TYPES[p.businessType] || BUSINESS_TYPES.other;
                return `<option value="${p.id}" ${prod && prod.projectId === p.id ? 'selected' : ''}><i class="fa-solid ${pbt.icon}"></i> ${p.name}</option>`;
            }).join('');

        const unitOptions = bt.units.map(u => 
            `<option value="${u}" ${prod && prod.unit === u ? 'selected' : ''}>${u}</option>`
        ).join('');

        const catSuggestions = bt.categorySuggestions.join('، ');

        body.innerHTML = `
            <div class="grid-2 mb-3">
                <div class="form-group">
                    <label class="form-label">المشروع التابع:</label>
                    <select id="pmProj" class="form-control" onchange="App.onProductProjChanged()" ${isEmployee ? 'disabled' : ''}>
                        ${projOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">اسم الصنف / المنتج / الخدمة: <span class="text-danger">*</span></label>
                    <input type="text" id="pmName" class="form-control" value="${prod ? prod.name : ''}" 
                        placeholder="مثال: ${bt.categorySuggestions[0] || 'اسم الصنف'}">
                </div>
            </div>
            <div class="grid-3 mb-3">
                <div class="form-group">
                    <label class="form-label">التصنيف:</label>
                    <input type="text" id="pmCat" class="form-control" value="${prod ? prod.category : ''}" 
                        placeholder="${catSuggestions}" list="pmCatList">
                    <datalist id="pmCatList">
                        ${bt.categorySuggestions.map(c => `<option value="${c}">`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label class="form-label">وحدة القياس:</label>
                    <select id="pmUnit" class="form-control">
                        ${unitOptions}
                        <option value="">مخصص...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${bt.hasBarcode ? 'كود / باركود / QR:' : 'رمز أو كود الصنف:'}</label>
                    <div style="display:flex; gap:4px;">
                        <input type="text" id="pmCode" class="form-control" value="${prod ? (prod.code || prod.barcode || '') : ''}" placeholder="اكتب أو امسح الكود...">
                        <button type="button" class="btn btn-outline" onclick="App.openCameraQrScanner('productModal')" title="مسح الكود بالكاميرا"><i class="fa-solid fa-camera"></i></button>
                        <button type="button" class="btn btn-outline" onclick="App.generateQrCodeForProduct()" title="توليد كود تلقائي"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                    </div>
                </div>
            </div>
            <div id="priceFieldsSection">
                <div class="${bt.hasPriceTiers ? 'grid-4' : 'grid-2'} mb-3">
                    <div class="form-group">
                        <label class="form-label">سعر التكلفة (₪):</label>
                        <input type="number" id="pmCost" class="form-control" step="0.01" value="${prod ? prod.costPrice : 0}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${bt.hasPriceTiers ? 'سعر المفرق (₪):' : 'سعر البيع (₪):'}</label>
                        <input type="number" id="pmRetail" class="form-control" step="0.01" value="${prod ? prod.retailPrice : 0}">
                    </div>
                    ${bt.hasPriceTiers ? `
                    <div class="form-group">
                        <label class="form-label">نصف الجملة (₪):</label>
                        <input type="number" id="pmSemi" class="form-control" step="0.01" value="${prod ? prod.semiWholesalePrice || 0 : 0}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">الجملة (₪):</label>
                        <input type="number" id="pmWhole" class="form-control" step="0.01" value="${prod ? prod.wholesalePrice || 0 : 0}">
                    </div>` : ''}
                </div>
            </div>
            ${bt.hasStock ? `
            <div class="form-group">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <label class="form-label mb-0">الرصيد / الكمية المتوفرة (<span id="pmUnitLabel">${bt.unitLabel}</span>):</label>
                    <label style="font-size:0.82rem; cursor:pointer; font-weight:700; color:var(--primary); display:flex; align-items:center; gap:0.35rem; user-select:none;">
                        <input type="checkbox" id="pmStockUnknown" onchange="App.onStockUnknownToggle()" ${prod && (prod.isUnknownStock || prod.stock === null || prod.stock === 'unknown') ? 'checked' : ''}>
                        <span>(غير معروف)</span>
                    </label>
                </div>
                <input type="number" id="pmStock" class="form-control" value="${prod ? (prod.isUnknownStock || prod.stock === null || prod.stock === 'unknown' ? '' : prod.stock) : 0}" step="0.01" min="0" ${prod && (prod.isUnknownStock || prod.stock === null || prod.stock === 'unknown') ? 'disabled style="background:var(--bg-surface); opacity:0.65;" placeholder="الكمية المتوفرة غير معروفة / متاحة للبيع دائماً"' : ''}>
            </div>` : `
            <div class="p-2 rounded text-muted small" style="background:var(--bg-surface);">
                <i class="fa-solid fa-circle-info"></i> لا يوجد مخزون قابل للتتبع لهذا نوع من النشاط (خدمات).
                <input type="hidden" id="pmStock" value="0">
                <input type="hidden" id="pmStockUnknown" value="0">
            </div>`}
            <div class="mt-2 p-2 rounded" style="background:var(--primary-soft); font-size:0.8rem; color:var(--primary);">
                <i class="fa-solid fa-lightbulb"></i> <strong>تلميح:</strong> ${bt.saleTip}
            </div>
        `;

        // ربط حدث تغيير وحدة القياس لتحديث التسمية
        setTimeout(() => {
            const unitSel = document.getElementById('pmUnit');
            const unitLabel = document.getElementById('pmUnitLabel');
            if (unitSel && unitLabel) {
                unitSel.addEventListener('change', () => {
                    if (unitSel.value) unitLabel.innerText = unitSel.value;
                });
            }
        }, 50);

        submit.style.display = 'inline-flex';
        submit.innerText = isEdit ? 'حفظ التعديلات' : 'حفظ الصنف في قاعدة البيانات';
        submit.onclick = () => {
            if (!navigator.onLine) {
                alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! تم منع حفظ الصنف لحماية السجلات.');
                return;
            }
            if (!this.checkPermission('canManageInventory')) {
                alert('⚠️ غير مصرح لك بإضافة أو تعديل أصناف المخزون!');
                return;
            }

            const projId = isEmployee ? user.assignedProject : document.getElementById('pmProj').value;
            const name = document.getElementById('pmName').value.trim();
            if (!name) { alert('أدخل اسم الصنف.'); return; }

            const selectedBT = getProjectBusinessType(projId);
            const unitSel = document.getElementById('pmUnit');
            const unit = (unitSel && unitSel.value) ? unitSel.value : selectedBT.unitLabel;

            const isUnknownStock = document.getElementById('pmStockUnknown')?.checked || false;
            const stockVal = isUnknownStock ? null : (parseFloat(document.getElementById('pmStock')?.value) || 0);

            const pData = {
                projectId: projId,
                name: name,
                code: document.getElementById('pmCode').value.trim(),
                barcode: '',
                category: document.getElementById('pmCat').value.trim() || 'عام',
                unit: unit,
                costPrice: parseFloat(document.getElementById('pmCost').value) || 0,
                retailPrice: parseFloat(document.getElementById('pmRetail').value) || 0,
                semiWholesalePrice: selectedBT.hasPriceTiers ? (parseFloat(document.getElementById('pmSemi').value) || 0) : 0,
                wholesalePrice: selectedBT.hasPriceTiers ? (parseFloat(document.getElementById('pmWhole').value) || 0) : 0,
                isUnknownStock: isUnknownStock,
                stock: stockVal
            };

            if (isEdit) {
                Object.assign(prod, pData);
            } else {
                pData.id = 'p_' + Date.now();
                AppState.products.push(pData);
            }

            this.saveState();
            this.closeModal('genericModal');
            this.renderInventory();
            this.renderDashboard();
            alert('تم حفظ الصنف بنجاح.');
        };

        this.openModal('genericModal');
    },

    onStockUnknownToggle() {
        const chk = document.getElementById('pmStockUnknown');
        const input = document.getElementById('pmStock');
        if (!chk || !input) return;
        if (chk.checked) {
            input.disabled = true;
            input.value = '';
            input.placeholder = 'الكمية المتوفرة غير معروفة / متاحة للبيع دائماً';
            input.style.background = 'var(--bg-surface)';
            input.style.opacity = '0.65';
        } else {
            input.disabled = false;
            input.value = '0';
            input.placeholder = '';
            input.style.background = '';
            input.style.opacity = '1';
            input.focus();
        }
    },

    onProductProjChanged() {
        // إعادة بناء قسم الأسعار والوحدات عند تغيير المشروع
        const projId = document.getElementById('pmProj').value;
        const bt = getProjectBusinessType(projId);

        const unitSel = document.getElementById('pmUnit');
        if (unitSel) {
            unitSel.innerHTML = bt.units.map(u => `<option value="${u}">${u}</option>`).join('') + '<option value="">مخصص...</option>';
        }

        const catInput = document.getElementById('pmCat');
        if (catInput) catInput.placeholder = bt.categorySuggestions.join('، ');

        const pmCatList = document.getElementById('pmCatList');
        if (pmCatList) {
            pmCatList.innerHTML = bt.categorySuggestions.map(c => `<option value="${c}">`).join('');
        }

        // تحديث حقول الأسعار
        const priceSection = document.getElementById('priceFieldsSection');
        if (priceSection) {
            priceSection.innerHTML = `
                <div class="${bt.hasPriceTiers ? 'grid-4' : 'grid-2'} mb-3">
                    <div class="form-group">
                        <label class="form-label">سعر التكلفة (₪):</label>
                        <input type="number" id="pmCost" class="form-control" step="0.01" value="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${bt.hasPriceTiers ? 'سعر المفرق (₪):' : 'سعر البيع (₪):'}</label>
                        <input type="number" id="pmRetail" class="form-control" step="0.01" value="0">
                    </div>
                    ${bt.hasPriceTiers ? `
                    <div class="form-group">
                        <label class="form-label">نصف الجملة (₪):</label>
                        <input type="number" id="pmSemi" class="form-control" step="0.01" value="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">الجملة (₪):</label>
                        <input type="number" id="pmWhole" class="form-control" step="0.01" value="0">
                    </div>` : ''}
                </div>
            `;
        }

        const pmUnitLabel = document.getElementById('pmUnitLabel');
        if (pmUnitLabel) pmUnitLabel.innerText = bt.unitLabel;
    },

    deleteProduct(id) {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! لا يمكن حذف الأصناف.');
            return;
        }
        if (!this.checkPermission('canManageInventory')) {
            alert('⚠️ غير مصرح لك بحذف أصناف المخزون!');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف الصنف؟')) return;
        AppState.products = AppState.products.filter(p => p.id !== id);
        this.saveState();
        this.renderInventory();
        this.renderDashboard();
    },

    /* ========================================================
       6. الحسابات المالية وإدارة السيولة والحساب الأولي
       ======================================================== */
    renderAccounts() {
        const grid = document.getElementById('bankAccountsCardsGrid');
        if (!grid) return;

        grid.innerHTML = AppState.accounts.map(acc => {
            let icon = 'fa-building-columns';
            if (acc.type === 'wallet') icon = 'fa-wallet';
            if (acc.type === 'jawwal') icon = 'fa-qrcode';
            if (acc.type === 'cash') icon = 'fa-money-bills';

            // حساب توزيع المشاريع ديناميكياً من Firebase
            const projects = AppState.projects;
            const allocEntries = projects.map(p => ({
                name: p.name,
                id: p.id,
                amount: (acc.allocations && acc.allocations[p.id]) || 0
            }));
            const sumAlloc = allocEntries.reduce((s, e) => s + Math.max(0, e.amount), 0) || 1;

            // شريط توزيع السيولة
            const colors = ['var(--primary)', 'var(--secondary)', 'var(--accent)', '#10b981', '#f59e0b'];
            let barHtml = '';
            let legendHtml = '';
            let detailHtml = '';

            allocEntries.forEach((e, idx) => {
                const pct = Math.round((Math.max(0, e.amount) / sumAlloc) * 100);
                if (pct > 0) {
                    barHtml += `<div style="width:${pct}%; background:${colors[idx % colors.length]}; height:100%; border-radius:${idx === 0 ? '4px 0 0 4px' : idx === allocEntries.length - 1 ? '0 4px 4px 0' : '0'};"></div>`;
                }
                legendHtml += `<span style="color:${colors[idx % colors.length]}; font-weight:700;">${e.name.length > 10 ? e.name.slice(0,10) + '…' : e.name}: ${pct}%</span>`;
                const isLast = idx === allocEntries.length - 1;
                detailHtml += `
                    <div class="d-flex justify-content-between py-1 ${isLast ? '' : 'border-bottom'}">
                        <span>${e.name}:</span>
                        <strong style="color:${e.amount < 0 ? 'var(--danger)' : colors[idx % colors.length]}">${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪</strong>
                    </div>`;
            });

            return `
            <div class="bank-card-item ${acc.type} ${acc.isPrimary ? 'is-primary' : ''}">
                ${acc.isPrimary ? '<div class="primary-badge-banner"><i class="fa-solid fa-star"></i> الحساب الأولي المعتمد</div>' : ''}
                <div>
                    <div class="d-flex justify-content-between align-items-center mb-2" style="margin-top: ${acc.isPrimary ? '18px' : '0'};">
                        <h3 style="font-size:1.15rem; font-weight:800;"><i class="fa-solid ${icon}"></i> ${acc.name}</h3>
                        <span class="badge badge-blue">${acc.accountNumber}</span>
                    </div>
                    <div class="my-3">
                        <small class="text-muted" style="font-weight:600;">حجم السيولة الفعلي المتوفر (من Firebase):</small>
                        <h2 class="text-primary mt-1" style="font-weight:900; font-size:1.6rem;">${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ₪</h2>
                    </div>

                    <div class="liquidity-progress-wrapper">
                        <div class="d-flex justify-content-between flex-wrap" style="font-size:0.73rem; font-weight:700; margin-bottom:0.25rem; gap:0.3rem;">
                            ${legendHtml}
                        </div>
                        <div class="liquidity-bar-container" style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:var(--bg-surface);">
                            ${barHtml || '<div style="width:100%; background:var(--border); height:100%;"></div>'}
                        </div>
                    </div>

                    <div style="background:var(--bg-surface); padding:0.85rem; border-radius:var(--radius-sm); font-size:0.85rem; margin-top:0.75rem;">
                        <div style="font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">توزيع الرصيد المحاسبي على المشاريع:</div>
                        ${detailHtml || '<div class="text-muted text-center py-1">لا يوجد توزيع مسجل</div>'}
                    </div>
                </div>

                <div class="mt-3 pt-3 border-top d-flex gap-2 align-items-center justify-content-between flex-wrap">
                    ${acc.isPrimary 
                        ? '<span class="badge badge-amber"><i class="fa-solid fa-circle-check"></i> الحساب الأساسي للعمليات</span>' 
                        : `<button class="btn btn-sm btn-outline" onclick="App.setPrimaryAccount('${acc.id}')"><i class="fa-regular fa-star"></i> اعتماده كأولي</button>`}
                    <button class="btn btn-sm btn-primary" onclick="App.openEditSingleAccountModal('${acc.id}')"><i class="fa-solid fa-sliders"></i> ضبط السيولة</button>
                </div>
            </div>`;
        }).join('');
    },

    toggleBankCardsVisibility() {
        const grid = document.getElementById('bankAccountsCardsGrid');
        const btn = document.getElementById('toggleBankCardsGridBtn');
        if (!grid) return;

        if (grid.classList.contains('collapsible-shown')) {
            grid.classList.remove('collapsible-shown');
            grid.classList.add('collapsible-hidden');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i> <span>عرض بطاقات الحسابات</span>';
        } else {
            grid.classList.remove('collapsible-hidden');
            grid.classList.add('collapsible-shown');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> <span>إخفاء بطاقات الحسابات</span>';
        }
    },

    setPrimaryAccount(accId) {
        AppState.accounts.forEach(a => {
            a.isPrimary = (a.id === accId);
        });
        const chosen = AppState.accounts.find(a => a.id === accId);
        this.saveState();
        this.renderAll();
        alert(`تم اعتماد "${chosen ? chosen.name : ''}" كحساب أولي وافتراضي للعمليات.`);
    },

    openLiquidityModal() {
        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = '<i class="fa-solid fa-coins text-amber"></i> إدارة حجم السيولة وتحديد الحساب الأولي المعتمد';

        const projects = AppState.projects;

        let html = `
            <p class="text-muted small mb-3">حدد حجم السيولة الحقيقية المتوفرة في كل حساب (تُحفظ فورياً في Firebase) واختر الحساب المعتمد كأولي للعمليات:</p>
            <div style="display:flex; flex-direction:column; gap:1rem;">
        `;

        AppState.accounts.forEach((acc) => {
            const cols = projects.length > 0 ? `grid-template-columns: 1fr ${projects.map(() => '1fr').join(' ')}` : 'grid-template-columns: 1fr';

            let projInputs = projects.map((p, idx) => {
                const allocVal = (acc.allocations && acc.allocations[p.id]) || 0;
                const bt = getProjectBusinessType(p.id);
                return `
                <div>
                    <label class="form-label" style="font-size:0.73rem;"><i class="fa-solid ${bt.icon}"></i> ${p.name.length > 14 ? p.name.slice(0,14) + '…' : p.name} (₪):</label>
                    <input type="number" id="liqA_${acc.id}_${p.id}" class="form-control" step="0.01" value="${allocVal}">
                </div>`;
            }).join('');

            html += `
            <div class="card p-3 mb-0" style="background:var(--bg-surface); border:${acc.isPrimary ? '2px solid var(--accent)' : '1px solid var(--border)'};">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <label style="font-weight:800; display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="radio" name="primaryAccRadio" value="${acc.id}" ${acc.isPrimary ? 'checked' : ''}>
                        <span>${acc.name}</span>
                    </label>
                    ${acc.isPrimary ? '<span class="badge badge-amber"><i class="fa-solid fa-star"></i> الحساب الأولي الحالي</span>' : '<span class="text-muted small">حدد لاعتماده كأولي</span>'}
                </div>
                <div style="display:grid; ${cols}; gap:0.5rem;">
                    <div>
                        <label class="form-label" style="font-size:0.73rem;">إجمالي السيولة (₪):</label>
                        <input type="number" id="liqBal_${acc.id}" class="form-control" step="0.01" value="${acc.balance}" oninput="App.onLiqBalChange('${acc.id}')">
                    </div>
                    ${projInputs}
                </div>
            </div>`;
        });

        html += `</div>`;
        body.innerHTML = html;

        submit.style.display = 'inline-flex';
        submit.innerText = 'تثبيت وحفظ الأرصدة في Firebase';
        submit.onclick = () => {
            const selectedPrimary = document.querySelector('input[name="primaryAccRadio"]:checked')?.value;

            AppState.accounts.forEach(acc => {
                const balInput = document.getElementById(`liqBal_${acc.id}`);
                if (balInput) acc.balance = parseFloat(balInput.value) || 0;
                if (!acc.allocations) acc.allocations = {};

                projects.forEach(p => {
                    const aInput = document.getElementById(`liqA_${acc.id}_${p.id}`);
                    if (aInput) acc.allocations[p.id] = parseFloat(aInput.value) || 0;
                });

                acc.isPrimary = (acc.id === selectedPrimary);
            });

            this.saveState();
            this.closeModal('genericModal');
            this.renderAll();
            alert('تم حفظ وتحديث أرصدة السيولة في قاعدة بيانات Firebase بنجاح!');
        };

        this.openModal('genericModal');
    },

    onLiqBalChange(accId) {
        const bal = parseFloat(document.getElementById(`liqBal_${accId}`)?.value) || 0;
        const projects = AppState.projects;
        if (projects.length === 0) return;

        // توزيع الرصيد بالتساوي على المشاريع
        const share = parseFloat((bal / projects.length).toFixed(2));
        projects.forEach((p, idx) => {
            const aInput = document.getElementById(`liqA_${accId}_${p.id}`);
            if (aInput) {
                // آخر مشروع يأخذ الباقي لتجنب التقريب
                if (idx === projects.length - 1) {
                    const prevSum = projects.slice(0, -1).reduce((s) => s + share, 0);
                    aInput.value = parseFloat((bal - prevSum).toFixed(2));
                } else {
                    aInput.value = share;
                }
            }
        });

        // فولباك للحقول القديمة إن وجدت
        const a1Input = document.getElementById(`liqA1_${accId}`);
        const a2Input = document.getElementById(`liqA2_${accId}`);
        if (a1Input && a2Input) {
            const half = parseFloat((bal / 2).toFixed(2));
            a1Input.value = half;
            a2Input.value = parseFloat((bal - half).toFixed(2));
        }
    },

    openEditSingleAccountModal(accId) {
        const acc = AppState.accounts.find(a => a.id === accId);
        if (!acc) return;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const projects = AppState.projects;

        title.innerHTML = `<i class="fa-solid fa-sliders text-primary"></i> ضبط سيولة: ${acc.name}`;

        const projInputs = projects.map(p => {
            const allocVal = (acc.allocations && acc.allocations[p.id]) || 0;
            const bt = getProjectBusinessType(p.id);
            return `
            <div class="form-group">
                <label class="form-label"><i class="fa-solid ${bt.icon}"></i> ${p.name}:</label>
                <input type="number" id="editAccA_${p.id}" class="form-control" step="0.01" value="${allocVal}">
            </div>`;
        }).join('');

        body.innerHTML = `
            <div class="form-group mb-3">
                <label class="form-label">إجمالي السيولة المتوفرة في الحساب (₪):</label>
                <input type="number" id="editAccBal" class="form-control" step="0.01" value="${acc.balance}">
            </div>
            ${projects.length > 0 ? `
            <div style="font-weight:700; margin-bottom:0.5rem; font-size:0.85rem; color:var(--text-muted);">توزيع الرصيد على المشاريع:</div>
            <div class="${projects.length >= 3 ? 'grid-3' : 'grid-2'} mb-3">
                ${projInputs}
            </div>` : ''}
            <div class="form-group p-2 rounded" style="background:var(--bg-surface);">
                <label style="cursor:pointer; display:flex; align-items:center; gap:0.5rem; font-weight:700;">
                    <input type="checkbox" id="editAccPrimary" ${acc.isPrimary ? 'checked' : ''}>
                    <span>اعتماد هذا الحساب كحساب أولي وافتراضي للعمليات</span>
                </label>
            </div>
        `;

        submit.style.display = 'inline-flex';
        submit.innerText = 'حفظ وتحديث السحابة';
        submit.onclick = () => {
            const bal = parseFloat(document.getElementById('editAccBal').value) || 0;
            const isPrim = document.getElementById('editAccPrimary').checked;

            acc.balance = bal;
            if (!acc.allocations) acc.allocations = {};

            projects.forEach(p => {
                const aInput = document.getElementById(`editAccA_${p.id}`);
                if (aInput) acc.allocations[p.id] = parseFloat(aInput.value) || 0;
            });

            if (isPrim) {
                AppState.accounts.forEach(a => a.isPrimary = (a.id === acc.id));
            }

            this.saveState();
            this.closeModal('genericModal');
            this.renderAll();
            alert('تم تحديث السيولة في Firebase بنجاح.');
        };

        this.openModal('genericModal');
    },

    /* ========================================================
       7. التحويلات وتسويات المشاريع (Transfers)
       ======================================================== */
    renderTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        if (!tbody) return;

        tbody.innerHTML = AppState.transfers.map(t => `
            <tr>
                <td><strong>${t.id}</strong></td>
                <td>${t.date}</td>
                <td><span class="badge badge-blue">${t.type === 'inter_project' ? 'سداد نيابة عن المشروع الآخر' : 'تحويل بنكي داخلي'}</span></td>
                <td>${t.fromDesc}</td>
                <td>${t.toDesc}</td>
                <td><strong class="text-primary">${t.amount.toFixed(2)} ₪</strong></td>
                <td>${t.note}</td>
                <td>
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn btn-sm btn-outline text-primary" onclick="App.openTransferModal('${t.type}', '${t.id}')" title="تعديل الحركة"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteTransfer('${t.id}')" title="حذف الحركة وعكس أثرها"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="8" class="text-center py-4 text-muted">لا توجد تسويات مسجلة</td></tr>';
    },

    reverseTransferEffects(t) {
        if (!t) return;
        const amt = parseFloat(t.amount) || 0;
        if (amt <= 0) return;

        if (t.type === 'inter_project') {
            const acc = AppState.accounts.find(a => a.id === t.accountId || (t.fromDesc && t.fromDesc.includes(a.name)));
            const pFrom = t.fromProjectId || (AppState.projects.find(p => t.fromDesc && t.fromDesc.includes(p.name))?.id);
            if (acc) {
                acc.balance = parseFloat(((acc.balance || 0) + amt).toFixed(2));
                if (pFrom && acc.allocations) {
                    acc.allocations[pFrom] = parseFloat(((acc.allocations[pFrom] || 0) + amt).toFixed(2));
                }
            }
        } else {
            // bank_internal
            const fAcc = AppState.accounts.find(a => a.id === t.fromAccountId || a.name === t.fromDesc);
            const tAcc = AppState.accounts.find(a => a.id === t.toAccountId || a.name === t.toDesc);
            const p = t.projectId || (AppState.projects.find(prj => t.note && t.note.includes(prj.name))?.id);

            if (fAcc) {
                fAcc.balance = parseFloat(((fAcc.balance || 0) + amt).toFixed(2));
                if (p && fAcc.allocations) {
                    fAcc.allocations[p] = parseFloat(((fAcc.allocations[p] || 0) + amt).toFixed(2));
                }
            }
            if (tAcc) {
                tAcc.balance = parseFloat(((tAcc.balance || 0) - amt).toFixed(2));
                if (p && tAcc.allocations) {
                    tAcc.allocations[p] = parseFloat(((tAcc.allocations[p] || 0) - amt).toFixed(2));
                }
            }
        }
    },

    deleteTransfer(transferId) {
        if (!this.currentUser) { alert('يجب تسجيل الدخول أولاً.'); return; }
        if (!navigator.onLine) { alert('⚠️ لا يمكن الحذف أثناء انقطاع الاتصال بالإنترنت.'); return; }
        const t = AppState.transfers.find(x => x.id === transferId);
        if (!t) return;

        const confirmMsg = `هل أنت متأكد من حذف حركة (${t.id}) بمبلغ ${t.amount.toFixed(2)} ₪؟\nسيتم عكس الأثر المالي وإرجاع الأرصدة والسيولة للحسابات والمشاريع كما كانت.`;
        if (!confirm(confirmMsg)) return;

        this.reverseTransferEffects(t);
        AppState.transfers = AppState.transfers.filter(x => x.id !== transferId);
        this.saveState();
        this.renderAll();
        alert(`تم حذف الحركة (${t.id}) وعكس أثرها المالي بنجاح.`);
    },

    openTransferModal(type, transferId = null) {
        const isEdit = !!transferId;
        const existing = isEdit ? AppState.transfers.find(t => t.id === transferId) : null;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const effectiveType = existing ? existing.type : type;

        if (effectiveType === 'inter_project') {
            title.innerHTML = isEdit 
                ? `<i class="fa-solid fa-pen text-primary"></i> تعديل سداد مصروف نيابة عن المشروع الآخر (${existing.id})`
                : `<i class="fa-solid fa-arrows-turn-to-dots text-primary"></i> سداد مصروف نيابة عن المشروع الآخر`;

            const curFromP = existing ? (existing.fromProjectId || AppState.projects.find(p => existing.fromDesc?.includes(p.name))?.id) : '';
            const curToP = existing ? (existing.toProjectId || AppState.projects.find(p => existing.toDesc?.includes(p.name))?.id) : '';
            const curAcc = existing ? (existing.accountId || AppState.accounts.find(a => existing.fromDesc?.includes(a.name))?.id) : '';

            body.innerHTML = `
                <div class="grid-2 mb-3">
                    <div class="form-group">
                        <label class="form-label">المشروع الدافع (الذي سدد المبلغ):</label>
                        <select id="trPFrom" class="form-control">
                            ${AppState.projects.map(p => `<option value="${p.id}" ${p.id === curFromP ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">المشروع المستفيد (المدين بالمصروف):</label>
                        <select id="trPTo" class="form-control">
                            ${AppState.projects.slice().reverse().map(p => `<option value="${p.id}" ${p.id === curToP ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="grid-2 mb-3">
                    <div class="form-group">
                        <label class="form-label">الحساب المشترك المسحوب منه:</label>
                        <select id="trAcc" class="form-control">
                            ${AppState.accounts.map(a => `<option value="${a.id}" ${a.id === curAcc ? 'selected' : ''}>${a.name} (${a.balance.toFixed(2)}₪)</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">المبلغ المسدد (₪):</label>
                        <input type="number" id="trAmt" class="form-control" step="0.01" value="${existing ? existing.amount : '100.00'}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">البيان وتفاصيل المصروف:</label>
                    <input type="text" id="trNote" class="form-control" placeholder="مثال: سداد تكاليف إيجار أو شحن بضاعة خاصة بالمشروع الآخر" value="${existing ? (existing.note || '') : ''}">
                </div>
            `;

            submit.style.display = 'inline-flex';
            submit.innerText = isEdit ? 'حفظ التعديلات' : 'تسجيل وحفظ التسوية';

            submit.onclick = () => {
                const pFrom = document.getElementById('trPFrom').value;
                const pTo = document.getElementById('trPTo').value;
                const accId = document.getElementById('trAcc').value;
                const amt = parseFloat(document.getElementById('trAmt').value) || 0;
                const note = document.getElementById('trNote').value;

                if (pFrom === pTo) { alert('المشروع الدافع والمستفيد يجب أن يكونا مختلفين.'); return; }
                const acc = AppState.accounts.find(a => a.id === accId);
                if (!acc) { alert('الرجاء اختيار الحساب المسحوب منه.'); return; }

                if (isEdit && existing) {
                    this.reverseTransferEffects(existing);
                }

                if (acc.balance < amt) { 
                    alert('رصيد الحساب المسحوب منه غير كافٍ.'); 
                    if (isEdit && existing) this.renderAll();
                    return; 
                }

                acc.balance = parseFloat((acc.balance - amt).toFixed(2));
                if (!acc.allocations) acc.allocations = {};
                acc.allocations[pFrom] = parseFloat(((acc.allocations[pFrom] || 0) - amt).toFixed(2));

                const transferData = {
                    id: isEdit ? existing.id : ('TRF-' + Date.now().toString().slice(-4)),
                    date: isEdit ? existing.date : new Date().toISOString().slice(0, 10),
                    type: 'inter_project',
                    fromDesc: `${acc.name} (${this.getProjectName(pFrom)})`,
                    toDesc: `مصاريف (${this.getProjectName(pTo)})`,
                    amount: amt,
                    note: note || 'سداد نيابة عن المشروع الآخر',
                    fromProjectId: pFrom,
                    toProjectId: pTo,
                    accountId: accId
                };

                if (isEdit && existing) {
                    const idx = AppState.transfers.findIndex(t => t.id === existing.id);
                    if (idx !== -1) AppState.transfers[idx] = transferData;
                } else {
                    AppState.transfers.unshift(transferData);
                }

                this.saveState();
                this.closeModal('genericModal');
                this.renderAll();
                alert(isEdit ? 'تم حفظ تعديلات التسوية بنجاح!' : 'تم تسجيل التسوية بنجاح في السحابة!');
            };
        } else {
            title.innerHTML = isEdit
                ? `<i class="fa-solid fa-pen text-primary"></i> تعديل تحويل بين البنوك والمحافظ (${existing.id})`
                : `<i class="fa-solid fa-right-left text-primary"></i> تحويل بين البنوك والمحافظ المشتركة`;

            const curFId = existing ? (existing.fromAccountId || AppState.accounts.find(a => a.name === existing.fromDesc)?.id) : '';
            const curTId = existing ? (existing.toAccountId || AppState.accounts.find(a => a.name === existing.toDesc)?.id) : '';
            const curP = existing ? (existing.projectId || AppState.projects.find(p => existing.note?.includes(p.name))?.id) : '';

            body.innerHTML = `
                <div class="grid-2 mb-3">
                    <div class="form-group">
                        <label class="form-label">من الحساب:</label>
                        <select id="trFrom" class="form-control">
                            ${AppState.accounts.map(a => `<option value="${a.id}" ${a.id === curFId ? 'selected' : ''}>${a.name} (${a.balance.toFixed(2)}₪)</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">إلى الحساب:</label>
                        <select id="trTo" class="form-control">
                            ${AppState.accounts.map(a => `<option value="${a.id}" ${a.id === curTId ? 'selected' : ''}>${a.name} (${a.balance.toFixed(2)}₪)</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="grid-2 mb-3">
                    <div class="form-group">
                        <label class="form-label">المبلغ المحول (₪):</label>
                        <input type="number" id="trAmt" class="form-control" step="0.01" value="${existing ? existing.amount : '500.00'}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">المشروع صاحب السيولة:</label>
                        <select id="trP" class="form-control">
                            ${AppState.projects.map(p => `<option value="${p.id}" ${p.id === curP ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;

            submit.style.display = 'inline-flex';
            submit.innerText = isEdit ? 'حفظ التعديلات' : 'تنفيذ التحويل البنكي';

            submit.onclick = () => {
                const fId = document.getElementById('trFrom').value;
                const tId = document.getElementById('trTo').value;
                const amt = parseFloat(document.getElementById('trAmt').value) || 0;
                const p = document.getElementById('trP').value;

                if (fId === tId) { alert('اختر حسابين مختلفين للتحويل بينهما.'); return; }
                const fAcc = AppState.accounts.find(a => a.id === fId);
                const tAcc = AppState.accounts.find(a => a.id === tId);

                if (!fAcc || !tAcc) { alert('الحسابات المختارة غير صالحة.'); return; }

                if (isEdit && existing) {
                    this.reverseTransferEffects(existing);
                }

                if (fAcc.balance < amt) { 
                    alert('رصيد الحساب المحول منه غير كافٍ.'); 
                    if (isEdit && existing) this.renderAll();
                    return; 
                }

                fAcc.balance = parseFloat((fAcc.balance - amt).toFixed(2));
                tAcc.balance = parseFloat((tAcc.balance + amt).toFixed(2));
                if (!fAcc.allocations) fAcc.allocations = {};
                if (!tAcc.allocations) tAcc.allocations = {};
                fAcc.allocations[p] = parseFloat(((fAcc.allocations[p] || 0) - amt).toFixed(2));
                tAcc.allocations[p] = parseFloat(((tAcc.allocations[p] || 0) + amt).toFixed(2));

                const transferData = {
                    id: isEdit ? existing.id : ('TRF-' + Date.now().toString().slice(-4)),
                    date: isEdit ? existing.date : new Date().toISOString().slice(0, 10),
                    type: 'bank_internal',
                    fromDesc: fAcc.name,
                    toDesc: tAcc.name,
                    amount: amt,
                    note: `تحويل سيولة داخلي (${this.getProjectName(p)})`,
                    fromAccountId: fId,
                    toAccountId: tId,
                    projectId: p
                };

                if (isEdit && existing) {
                    const idx = AppState.transfers.findIndex(t => t.id === existing.id);
                    if (idx !== -1) AppState.transfers[idx] = transferData;
                } else {
                    AppState.transfers.unshift(transferData);
                }

                this.saveState();
                this.closeModal('genericModal');
                this.renderAll();
                alert(isEdit ? 'تم تحديث التحويل بنجاح!' : 'تم التحويل وحفظه بنجاح!');
            };
        }

        this.openModal('genericModal');
    },

    /* ========================================================
       8 & 9. العملاء والموردين (Customers & Suppliers)
       ======================================================== */
    renderCustomers() {
        const tbody = document.getElementById('customersTableBody');
        const thead = document.querySelector('#page-customers thead');
        if (!tbody) return;

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null);

        // ضبط رأس الجدول ليتناسب مع نطاق المشروع
        if (thead) {
            if (targetProj) {
                const pName = this.getProjectName(targetProj);
                thead.innerHTML = `
                    <tr>
                        <th>اسم العميل</th>
                        <th>فواتير مشروع (${pName})</th>
                        <th>إجمالي المبيعات</th>
                        <th>الذمة المستحقة لمشروع (${pName})</th>
                        <th>إجراءات</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>اسم العميل</th>
                        <th>عدد الفواتير</th>
                        <th>إجمالي المبيعات</th>
                        <th>المستحق للمشروع 1</th>
                        <th>المستحق للمشروع 2</th>
                        <th>إجمالي الدين المتبقي</th>
                        <th>إجراءات</th>
                    </tr>
                `;
            }
        }

        const custMap = this.getCustomersSummary(targetProj);
        const list = Object.values(custMap);
        if (list.length === 0) {
            const msg = targetProj 
                ? `لا يوجد عملاء مسجلون في مشروع (${this.getProjectName(targetProj)}) حالياً.` 
                : `لا يوجد عملاء مسجلون حالياً. يمكنك كتابة اسم العميل مباشرة عند إنشاء فاتورة بيع جديدة أو الضغط على زر "إضافة اسم عميل".`;
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-user-tag mb-2" style="font-size:1.6rem; display:block; opacity:0.6;"></i>${msg}</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(c => {
            if (targetProj) {
                return `
                <tr>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="badge badge-blue">${c.invCount} فواتير</span></td>
                    <td><strong>${c.totalSales.toFixed(2)} ₪</strong></td>
                    <td><strong class="${c.totalDue > 0 ? 'text-danger' : 'text-primary'}">${c.totalDue.toFixed(2)} ₪</strong></td>
                    <td>
                        <div class="d-flex gap-1 justify-content-center">
                            <button class="btn btn-sm btn-outline" onclick="App.showCustomerInvoicesStatement('${c.name.replace(/'/g, "\\'")}')" title="كشف فواتير العميل"><i class="fa-solid fa-file-invoice"></i> كشف</button>
                            <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteContact('customer', '${c.name.replace(/'/g, "\\'")}')" title="مسح الاسم"><i class="fa-solid fa-trash-can"></i> مسح</button>
                        </div>
                    </td>
                </tr>`;
            } else {
                return `
                <tr>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="badge badge-blue">${c.invCount} فواتير</span></td>
                    <td><strong>${c.totalSales.toFixed(2)} ₪</strong></td>
                    <td><strong class="${c.p1Due > 0 ? 'text-danger' : 'text-muted'}">${c.p1Due.toFixed(2)} ₪</strong></td>
                    <td><strong class="${c.p2Due > 0 ? 'text-danger' : 'text-muted'}">${c.p2Due.toFixed(2)} ₪</strong></td>
                    <td><strong class="${c.totalDue > 0 ? 'text-danger' : 'text-primary'}">${c.totalDue.toFixed(2)} ₪</strong></td>
                    <td>
                        <div class="d-flex gap-1 justify-content-center">
                            <button class="btn btn-sm btn-outline" onclick="App.showCustomerInvoicesStatement('${c.name.replace(/'/g, "\\'")}')" title="كشف فواتير العميل"><i class="fa-solid fa-file-invoice"></i> كشف</button>
                            <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteContact('customer', '${c.name.replace(/'/g, "\\'")}')" title="مسح الاسم"><i class="fa-solid fa-trash-can"></i> مسح</button>
                        </div>
                    </td>
                </tr>`;
            }
        }).join('');
    },

    showCustomerInvoicesStatement(name) {
        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null);

        const invoices = AppState.salesInvoices.filter(i => {
            if ((i.customerName || 'عميل نقدي') !== name) return false;
            if (targetProj && i.projectId !== targetProj) return false;
            return true;
        });

        let totalSales = 0;
        let totalDue = 0;
        invoices.forEach(i => {
            totalSales += (i.totalAmount || 0);
            totalDue += (i.remainingDue || 0);
        });

        title.innerHTML = `<i class="fa-solid fa-file-invoice-dollar text-primary"></i> كشف فواتير العميل: ${name} ${targetProj ? `(${this.getProjectName(targetProj)})` : ''}`;
        body.innerHTML = `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div class="d-flex justify-content-between flex-wrap gap-2">
                    <div>إجمالي المبيعات للعميل: <strong class="text-primary">${totalSales.toFixed(2)} ₪</strong></div>
                    <div>إجمالي الدين المستحق المتبقي: <strong class="${totalDue > 0 ? 'text-danger' : 'text-secondary'}">${totalDue.toFixed(2)} ₪</strong></div>
                </div>
            </div>
            <h4 style="font-size:0.95rem; margin-bottom:0.5rem;"><i class="fa-solid fa-list-check"></i> قائمة فواتير البيع:</h4>
            <div class="table-responsive" style="max-height:260px; overflow-y:auto;">
                <table class="data-table" style="font-size:0.8rem;">
                    <thead>
                        <tr>
                            <th>رقم الفاتورة</th>
                            <th>التاريخ</th>
                            <th>المشروع</th>
                            <th>الإجمالي</th>
                            <th>المدفوع</th>
                            <th>المتبقي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(inv => `
                            <tr>
                                <td><strong>${inv.invoiceNumber}</strong></td>
                                <td>${inv.date}</td>
                                <td>${App.getProjectName(inv.projectId)}</td>
                                <td><strong>${inv.totalAmount.toFixed(2)} ₪</strong></td>
                                <td class="text-secondary">${inv.paidAmount.toFixed(2)} ₪</td>
                                <td class="${inv.remainingDue > 0 ? 'text-danger font-bold' : 'text-muted'}">${inv.remainingDue.toFixed(2)} ₪</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" class="text-center py-3 text-muted">لا توجد فواتير سابقة لهذا الاسم في هذا المشروع</td></tr>'}
                    </tbody>
                </table>
            </div>
            <p class="text-muted small mt-3"><i class="fa-solid fa-info-circle"></i> يتم تجميع الفواتير لحظياً باسم العميل مباشرة بدون تخزين مسبق للعميل في قاعدة البيانات.</p>
        `;
        submit.style.display = 'none';
        this.openModal('genericModal');
    },

    renderSuppliers() {
        const tbody = document.getElementById('suppliersTableBody');
        const thead = document.querySelector('#page-suppliers thead');
        if (!tbody) return;

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null);

        // ضبط رأس الجدول ليتناسب مع نطاق المشروع
        if (thead) {
            if (targetProj) {
                const pName = this.getProjectName(targetProj);
                thead.innerHTML = `
                    <tr>
                        <th>اسم المورد</th>
                        <th>رقم الهاتف</th>
                        <th>العنوان</th>
                        <th>مستحقات المشروع (${pName})</th>
                        <th>إجراءات</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>اسم المورد</th>
                        <th>رقم الهاتف</th>
                        <th>العنوان</th>
                        <th>مستحقات المشروع 1</th>
                        <th>مستحقات المشروع 2</th>
                        <th>إجمالي المطلوب</th>
                        <th>إجراءات</th>
                    </tr>
                `;
            }
        }

        const suppliersList = this.getSuppliersForProject(targetProj);

        if (!suppliersList || suppliersList.length === 0) {
            const msg = targetProj 
                ? `لا يوجد موردون مسجلون في مشروع (${this.getProjectName(targetProj)}) حالياً.` 
                : `لا يوجد موردون مسجلون حالياً. استخدم زر "إضافة مورد" بالأعلى لإضافة موردك الأول يدوياً.`;
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-truck-ramp-box mb-2" style="font-size:1.6rem; display:block; opacity:0.6;"></i>${msg}</td></tr>`;
            return;
        }

        const p1 = AppState.projects[0]?.id || 'proj_01';
        const p2 = AppState.projects[1]?.id || 'proj_02';

        tbody.innerHTML = suppliersList.map(s => {
            if (targetProj) {
                let due = (s.balances && (s.balances[targetProj] !== undefined ? s.balances[targetProj] : 0)) || 0;
                return `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.phone || '-'}</td>
                    <td>${s.address || '-'}</td>
                    <td><strong class="${due > 0 ? 'text-danger' : (due < 0 ? 'text-success' : 'text-muted')}">${due.toFixed(2)} ₪ ${due < 0 ? '<small class="text-success font-normal">(دائن للمحل)</small>' : ''}</strong></td>
                    <td>
                        <div class="d-flex gap-1 justify-content-center">
                            <button class="btn btn-sm btn-outline" onclick="App.showAccountStatement('supplier', '${s.id}')" title="كشف حساب"><i class="fa-solid fa-file-invoice"></i> كشف</button>
                            <button class="btn btn-sm btn-primary" onclick="App.openContactModal('supplier', '${s.id}')" title="تعديل بيانات المورد"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>
                            <button class="btn btn-sm btn-danger" onclick="App.deleteContact('supplier', '${s.id}')" title="مسح المورد"><i class="fa-solid fa-trash-can"></i> مسح</button>
                        </div>
                    </td>
                </tr>`;
            } else {
                let b1 = (s.balances && (s.balances[p1] !== undefined ? s.balances[p1] : s.balances['proj_01'])) || 0;
                let b2 = (s.balances && (s.balances[p2] !== undefined ? s.balances[p2] : s.balances['proj_02'])) || 0;
                let total = Object.values(s.balances || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                if (Object.keys(s.balances || {}).length === 0) total = b1 + b2;

                return `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.phone || '-'}</td>
                    <td>${s.address || '-'}</td>
                    <td><strong class="${b1 > 0 ? 'text-danger' : (b1 < 0 ? 'text-success' : 'text-muted')}">${b1.toFixed(2)} ₪</strong></td>
                    <td><strong class="${b2 > 0 ? 'text-danger' : (b2 < 0 ? 'text-success' : 'text-muted')}">${b2.toFixed(2)} ₪</strong></td>
                    <td><strong class="${total > 0 ? 'text-danger' : (total < 0 ? 'text-success' : 'text-muted')}">${total.toFixed(2)} ₪ ${total < 0 ? '<small class="text-success font-normal">(دائن للمحل)</small>' : ''}</strong></td>
                    <td>
                        <div class="d-flex gap-1 justify-content-center">
                            <button class="btn btn-sm btn-outline" onclick="App.showAccountStatement('supplier', '${s.id}')" title="كشف حساب"><i class="fa-solid fa-file-invoice"></i> كشف</button>
                            <button class="btn btn-sm btn-primary" onclick="App.openContactModal('supplier', '${s.id}')" title="تعديل بيانات المورد"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>
                            <button class="btn btn-sm btn-danger" onclick="App.deleteContact('supplier', '${s.id}')" title="أيقونة مسح المورد بعد الحفظ"><i class="fa-solid fa-trash-can"></i> مسح المورد</button>
                        </div>
                    </td>
                </tr>`;
            }
        }).join('');
    },

    openContactModal(type, id = null) {
        const isCust = type === 'customer';
        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const defaultProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : AppState.projects[0]?.id);

        if (isCust) {
            title.innerHTML = `<i class="fa-solid fa-user-plus text-primary"></i> إضافة اسم عميل`;
            body.innerHTML = `
                <div class="form-group mb-3">
                    <label class="form-label">المشروع التابع له العميل:</label>
                    <input type="text" class="form-control" value="🏢 ${this.getProjectName(defaultProj)}" disabled style="background:var(--bg-surface); opacity:0.8;">
                </div>
                <div class="form-group mb-3">
                    <label class="form-label">اسم العميل: <span class="text-danger">*</span></label>
                    <input type="text" id="cmCustOnlyName" class="form-control" placeholder="أدخل اسم العميل (مثال: شركة النور، أحمد خليل)..."/>
                    <small class="text-muted mt-2 d-block"><i class="fa-solid fa-circle-info"></i> يتم تسجيل العميل لمشروع (${this.getProjectName(defaultProj)}) فقط.</small>
                </div>
            `;
            submit.style.display = 'inline-flex';
            submit.innerText = 'إضافة العميل';
            submit.onclick = () => {
                if (!navigator.onLine) {
                    alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! تم منع إضافة العملاء لحماية السجلات.');
                    return;
                }
                if (!this.checkPermission('canManageCustomers')) {
                    alert('⚠️ غير مصرح لك بإضافة أو إدارة عملاء الذمم!');
                    return;
                }

                const name = document.getElementById('cmCustOnlyName').value.trim();
                if (!name) {
                    alert('الرجاء كتابة اسم العميل.');
                    return;
                }
                if (!AppState.customers) AppState.customers = [];
                const exists = AppState.customers.find(c => c.name === name && c.projectId === defaultProj);
                if (!exists) {
                    AppState.customers.push({ 
                        id: 'c_' + Date.now(), 
                        name: name,
                        projectId: defaultProj 
                    });
                }
                this.saveState();
                this.closeModal('genericModal');
                this.renderCustomers();
                this.updateCustomerDatalist();
                alert(`تمت إضافة العميل "${name}" لمشروع (${this.getProjectName(defaultProj)}) بنجاح.`);
            };
            this.openModal('genericModal');
            return;
        }

        // الموردين (محفوظون في قاعدة البيانات)
        const existing = id ? AppState.suppliers.find(s => s.id === id) : null;
        title.innerHTML = existing 
            ? `<i class="fa-solid fa-user-pen text-primary"></i> تعديل بيانات المورد: ${existing.name}`
            : `<i class="fa-solid fa-truck text-primary"></i> إضافة مورد جديد`;

        const projSelectHtml = isEmployee
            ? `<input type="text" class="form-control" value="🏢 ${this.getProjectName(defaultProj)}" disabled style="background:var(--bg-surface); opacity:0.8;">
               <input type="hidden" id="cmSuppProj" value="${defaultProj}">`
            : `<select id="cmSuppProj" class="form-control">
                ${AppState.projects.map(p => `<option value="${p.id}" ${existing && existing.projectId === p.id ? 'selected' : (p.id === defaultProj ? 'selected' : '')}>${p.name}</option>`).join('')}
               </select>`;

        body.innerHTML = `
            <div class="grid-2 mb-3">
                <div class="form-group">
                    <label class="form-label">المشروع التابع له المورد:</label>
                    ${projSelectHtml}
                </div>
                <div class="form-group">
                    <label class="form-label">اسم المورد / الشركة: <span class="text-danger">*</span></label>
                    <input type="text" id="cmName" class="form-control" placeholder="مثال: شركة التوريدات العالمية" value="${existing ? existing.name : ''}">
                </div>
            </div>
            <div class="grid-2 mb-3">
                <div class="form-group">
                    <label class="form-label">رقم الهاتف:</label>
                    <input type="text" id="cmPhone" class="form-control" placeholder="059xxxxxxx" value="${existing && existing.phone !== '-' ? existing.phone : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">العنوان / الموقع:</label>
                    <input type="text" id="cmAddr" class="form-control" placeholder="مثال: غزة - المنطقة الصناعية" value="${existing && existing.address !== 'مباشر' ? existing.address : ''}">
                </div>
            </div>
        `;

        submit.style.display = 'inline-flex';
        submit.innerText = existing ? 'حفظ التعديلات' : 'حفظ المورد في قاعدة البيانات';
        submit.onclick = () => {
            if (!navigator.onLine) {
                alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! تم منع حفظ الموردين لحماية السجلات.');
                return;
            }
            if (!this.checkPermission('canManageSuppliers')) {
                alert('⚠️ غير مصرح لك بإدارة أو تعديل بيانات الموردين!');
                return;
            }

            const name = document.getElementById('cmName').value.trim();
            if (!name) {
                alert('الرجاء كتابة اسم المورد.');
                return;
            }

            const phone = document.getElementById('cmPhone').value.trim() || '-';
            const addr = document.getElementById('cmAddr').value.trim() || '-';
            const assignedProj = document.getElementById('cmSuppProj') ? document.getElementById('cmSuppProj').value : defaultProj;

            if (existing) {
                existing.name = name;
                existing.phone = phone;
                existing.address = addr;
                if (!isEmployee) existing.projectId = assignedProj;
            } else {
                const item = {
                    id: 's_' + Date.now(),
                    name: name,
                    phone: phone,
                    address: addr,
                    projectId: assignedProj,
                    balances: {}
                };
                AppState.suppliers.push(item);
            }

            this.saveState();
            this.closeModal('genericModal');
            this.renderSuppliers();
            alert(existing ? 'تم تحديث بيانات المورد بنجاح في قاعدة البيانات.' : `تم حفظ المورد بنجاح وربطه بمشروع (${this.getProjectName(assignedProj)}).`);
        };

        this.openModal('genericModal');
    },

    deleteContact(type, id) {
        if (!navigator.onLine) {
            alert('⚠️ تنبيه: انقطع الاتصال بالإنترنت! لا يمكن حذف جهات الاتصال.');
            return;
        }

        const isCust = type === 'customer';
        if (isCust) {
            if (!this.checkPermission('canManageCustomers')) {
                alert('⚠️ غير مصرح لك بحذف العملاء!');
                return;
            }
            AppState.customers = (AppState.customers || []).filter(c => c.id !== id && c.name !== id);
            this.renderCustomers();
            this.updateCustomerDatalist();
            alert(`تم مسح اسم العميل.`);
            return;
        }

        if (!this.checkPermission('canManageSuppliers')) {
            alert('⚠️ غير مصرح لك بحذف الموردين!');
            return;
        }

        const target = AppState.suppliers.find(s => s.id === id);
        if (!target) return;

        let totalDebt = 0;
        if (target.balances) {
            Object.values(target.balances).forEach(val => totalDebt += (val || 0));
        }

        let confirmMsg = `هل أنت متأكد من مسح المورد "${target.name}" نهائياً من قاعدة البيانات؟`;
        if (totalDebt > 0) {
            confirmMsg += `\nتنبيه هام: يوجد رصيد حساب معلّق بذمته قدره ${totalDebt.toFixed(2)} ₪!`;
        }

        if (!confirm(confirmMsg)) return;

        AppState.suppliers = AppState.suppliers.filter(s => s.id !== id);

        this.saveState();
        this.renderSuppliers();
        alert(`تم مسح المورد بنجاح من قاعدة البيانات.`);
    },

    deleteCurrentSupplierFromModal() {
        const suppSelect = document.getElementById('purSupp');
        if (!suppSelect || !suppSelect.value) {
            alert('الرجاء اختيار مورد من القائمة أولاً لمسحه.');
            return;
        }
        const suppId = suppSelect.value;
        this.deleteContact('supplier', suppId);
        
        // تحديث القائمة المنسدلة في النافذة فور المسح
        if (document.getElementById('purSupp')) {
            const pId = document.getElementById('purProj')?.value || AppState.projects[0]?.id;
            const suppliers = this.getSuppliersForProject(pId);
            document.getElementById('purSupp').innerHTML = suppliers && suppliers.length > 0 
                ? suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('') 
                : '<option value="">-- مورد نقدي / مباشر --</option>';
        }
    },

    showAccountStatement(type, id) {
        const entity = AppState.suppliers.find(s => s.id === id);
        if (!entity) return;

        const user = this.currentUser;
        const isEmployee = user && user.role === 'employee' && !user.permissions?.canViewAllProjects;
        const targetProj = isEmployee ? user.assignedProject : (AppState.currentProject !== 'all' ? AppState.currentProject : null);

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = `<i class="fa-solid fa-file-invoice-dollar text-primary"></i> كشف حساب المورد: ${entity.name}`;
        
        let allocHtml = '';
        let grandTotal = 0;

        if (targetProj) {
            const b = (entity.balances && entity.balances[targetProj]) || 0;
            grandTotal = b;
            allocHtml = `<div>مشروع ${this.getProjectName(targetProj)}: <span class="text-danger">${b.toFixed(2)} ₪</span></div>`;
        } else {
            AppState.projects.forEach(p => {
                const b = (entity.balances && entity.balances[p.id]) || 0;
                grandTotal += b;
                allocHtml += `<div>${p.name}: <span class="text-danger">${b.toFixed(2)} ₪</span></div>`;
            });
        }

        const relevantInvoices = AppState.purchaseInvoices.filter(i => {
            if (i.supplierId !== id) return false;
            if (targetProj && i.projectId !== targetProj) return false;
            return true;
        });

        let invHtml = '';
        if (relevantInvoices.length > 0) {
            invHtml = `
            <div class="mt-3">
                <h4 style="font-size:0.95rem; margin-bottom:0.5rem;"><i class="fa-solid fa-list-check"></i> سجل فواتير الشراء والتوريد:</h4>
                <div class="table-responsive" style="max-height:220px; overflow-y:auto;">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                                <th>المبلغ الإجمالي</th>
                                <th>المدفوع</th>
                                <th>المتبقي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${relevantInvoices.map(inv => `
                                <tr>
                                    <td><strong>${inv.invoiceNumber}</strong></td>
                                    <td>${inv.date}</td>
                                    <td><strong>${inv.totalAmount.toFixed(2)} ₪</strong></td>
                                    <td class="text-secondary">${inv.paidAmount.toFixed(2)} ₪</td>
                                    <td class="${inv.remainingDue > 0 ? 'text-danger font-bold' : 'text-muted'}">${inv.remainingDue.toFixed(2)} ₪</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        } else {
            invHtml = `<div class="text-muted small mt-2">لا توجد فواتير سابقة مسجلة لهذا المورد في هذا المشروع.</div>`;
        }

        body.innerHTML = `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <p><strong>الهاتف:</strong> ${entity.phone} | <strong>العنوان:</strong> ${entity.address || '-'}</p>
                <div style="margin-top:0.75rem; font-weight:bold;">
                    ${allocHtml}
                    <div class="mt-2 pt-2 border-top">إجمالي الرصيد المستحق: <span class="text-primary">${grandTotal.toFixed(2)} ₪</span></div>
                </div>
            </div>
            ${invHtml}
            <div class="mt-3 pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2">
                <p class="text-muted small mb-0">الأرصدة مستدعاة ومحسوبة مباشرة من قاعدة بيانات Firebase.</p>
                <button class="btn btn-sm btn-danger" onclick="App.deleteContact('supplier', '${entity.id}'); App.closeModal('genericModal');" title="مسح المورد نهائياً"><i class="fa-solid fa-trash-can"></i> مسح هذا المورد</button>
            </div>
        `;

        submit.style.display = 'none';
        this.openModal('genericModal');
    },

    /* ========================================================
       10. المحاسبة والقيود اليومية (Accounting)
       ======================================================== */
    renderAccounting() {
        const tbody = document.getElementById('journalEntriesTableBody');
        if (!tbody) return;

        const entries = this.filterProject(AppState.journalEntries);
        tbody.innerHTML = entries.map(j => `
            <tr>
                <td><strong>${j.entryNumber}</strong></td>
                <td>${j.date}</td>
                <td><span class="badge badge-blue">${this.getProjectName(j.projectId)}</span></td>
                <td>${j.desc}</td>
                <td><strong class="text-primary">${j.debitTotal.toFixed(2)} ₪</strong></td>
                <td><strong class="text-success">${j.creditTotal.toFixed(2)} ₪</strong></td>
                <td><span class="badge badge-green">متوازن</span></td>
                <td>
                    <div class="d-flex gap-1 justify-content-center">
                        <button class="btn btn-sm btn-outline" onclick="App.viewJournalLines('${j.id}')" title="عرض أطراف القيد"><i class="fa-solid fa-eye"></i></button>
                        <button class="btn btn-sm btn-outline text-primary" onclick="App.openJournalEntryModal('${j.id}')" title="تعديل القيد"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteJournalEntry('${j.id}')" title="حذف القيد"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="8" class="text-center py-4 text-muted">لا توجد قيود مسجلة بعد</td></tr>';
    },

    deleteJournalEntry(jId) {
        const j = AppState.journalEntries.find(x => x.id === jId);
        if (!j) return;

        if (!confirm(`هل أنت متأكد من حذف سند القيد (${j.entryNumber}) بقيمة ${j.debitTotal.toFixed(2)} ₪؟\nالبيان: ${j.desc}`)) return;

        AppState.journalEntries = AppState.journalEntries.filter(x => x.id !== jId);
        this.saveState();
        this.renderAccounting();
        alert(`تم حذف سند القيد (${j.entryNumber}) بنجاح.`);
    },

    viewJournalLines(jId) {
        const j = AppState.journalEntries.find(x => x.id === jId);
        if (!j) return;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = `<i class="fa-solid fa-file-invoice-dollar text-primary"></i> سند قيد يومية: ${j.entryNumber}`;
        body.innerHTML = `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
                    <div><strong>التاريخ:</strong> ${j.date}</div>
                    <div><strong>المشروع:</strong> <span class="badge badge-blue">${this.getProjectName(j.projectId)}</span></div>
                </div>
                <div><strong>البيان المحاسبي:</strong> ${j.desc}</div>
            </div>

            <table class="data-table mt-2">
                <thead><tr><th>الحساب</th><th>مدين (Debit)</th><th>دائن (Credit)</th></tr></thead>
                <tbody>
                    ${(j.lines || []).map(l => `<tr><td><strong>${l.account}</strong></td><td class="text-primary font-bold">${l.debit > 0 ? l.debit.toFixed(2) + ' ₪' : '-'}</td><td class="text-success font-bold">${l.credit > 0 ? l.credit.toFixed(2) + ' ₪' : '-'}</td></tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <th>الإجمالي</th>
                        <th class="text-primary">${j.debitTotal.toFixed(2)} ₪</th>
                        <th class="text-success">${j.creditTotal.toFixed(2)} ₪</th>
                    </tr>
                </tfoot>
            </table>

            <div class="mt-3 pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> سند قيد متوازن</span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline text-primary" onclick="App.openJournalEntryModal('${j.id}')"><i class="fa-solid fa-pen"></i> تعديل القيد</button>
                    <button class="btn btn-sm btn-outline text-danger" onclick="App.deleteJournalEntry('${j.id}'); App.closeModal('genericModal');"><i class="fa-solid fa-trash"></i> حذف القيد</button>
                </div>
            </div>
        `;

        submit.style.display = 'none';
        this.openModal('genericModal');
    },

    openJournalEntryModal(jId = null) {
        const isEdit = !!jId;
        const j = isEdit ? AppState.journalEntries.find(x => x.id === jId) : null;

        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = isEdit 
            ? `<i class="fa-solid fa-pen text-primary"></i> تعديل سند قيد يومية (${j.entryNumber})` 
            : `<i class="fa-solid fa-plus text-primary"></i> إضافة سند قيد يومية يدوي`;

        const curDate = j ? j.date : new Date().toISOString().slice(0, 10);
        const curProj = j ? j.projectId : (AppState.currentProject !== 'all' ? AppState.currentProject : AppState.projects[0]?.id || '');
        const curDesc = j ? j.desc : '';
        const curNumber = j ? j.entryNumber : ('JV-' + (1000 + AppState.journalEntries.length + 1));

        this.tempJournalLines = isEdit && j.lines && j.lines.length > 0 
            ? JSON.parse(JSON.stringify(j.lines))
            : [
                { account: 'الصندوق الرئيسي', debit: 100, credit: 0 },
                { account: 'إيرادات المبيعات', debit: 0, credit: 100 }
            ];

        body.innerHTML = `
            <div class="grid-3 mb-3">
                <div class="form-group">
                    <label class="form-label">رقم سند القيد:</label>
                    <input type="text" id="jeNumber" class="form-control" value="${curNumber}">
                </div>
                <div class="form-group">
                    <label class="form-label">التاريخ:</label>
                    <input type="date" id="jeDate" class="form-control" value="${curDate}">
                </div>
                <div class="form-group">
                    <label class="form-label">المشروع المستفيد:</label>
                    <select id="jeProject" class="form-control">
                        ${AppState.projects.map(p => `<option value="${p.id}" ${p.id === curProj ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="form-group mb-3">
                <label class="form-label">البيان المحاسبي العام: <span class="text-danger">*</span></label>
                <input type="text" id="jeDesc" class="form-control" placeholder="اكتب شرحاً وافياً للعملية المحاسبية..." value="${curDesc}">
            </div>

            <div class="mb-2 d-flex justify-content-between align-items-center">
                <strong style="font-size:0.9rem;"><i class="fa-solid fa-scale-balanced text-primary"></i> أطراف القيد المزدوج:</strong>
                <button type="button" class="btn btn-sm btn-outline" onclick="App.addJournalLine()"><i class="fa-solid fa-plus"></i> إضافة طرف جديد</button>
            </div>

            <datalist id="jeAccountSuggestions">
                <option value="الصندوق الرئيسي">
                <option value="البنك / المحفظة الإلكترونية">
                <option value="إيرادات المبيعات">
                <option value="تكلفة البضاعة المباعة">
                <option value="مشتريات مواد خام">
                <option value="مصاريف تشغيلية">
                <option value="إيجار ومرافق">
                <option value="ذمم عملاء (مدينون)">
                <option value="ذمم موردين (دائنون)">
                <option value="رواتب وأجور">
                <option value="جاري الشركاء / مسحوبات">
                <option value="رأس المال">
            </datalist>

            <div class="table-responsive mb-3" style="max-height:220px; overflow-y:auto;">
                <table class="data-table" style="font-size:0.85rem;">
                    <thead>
                        <tr>
                            <th style="width:45%;">اسم الحساب</th>
                            <th style="width:25%;">مدين (Debit) ₪</th>
                            <th style="width:25%;">دائن (Credit) ₪</th>
                            <th style="width:5%;">إجراء</th>
                        </tr>
                    </thead>
                    <tbody id="jeLinesBody"></tbody>
                </table>
            </div>

            <div id="jeBalanceNotice" class="p-2 rounded mb-1" style="font-size:0.83rem;"></div>
        `;

        this.renderJournalEntryLines();

        submit.style.display = 'inline-flex';
        submit.innerText = isEdit ? 'حفظ تعديلات القيد' : 'اعتماد وحفظ سند القيد';
        submit.onclick = () => {
            const desc = document.getElementById('jeDesc').value.trim();
            if (!desc) {
                alert('الرجاء كتابة البيان المحاسبي للقيد.');
                return;
            }

            if (!this.tempJournalLines || this.tempJournalLines.length < 2) {
                alert('يجب أن يحتوي القيد على طرفين على الأقل (مدين ودائن).');
                return;
            }

            for (let i = 0; i < this.tempJournalLines.length; i++) {
                const l = this.tempJournalLines[i];
                if (!l.account || !l.account.trim()) {
                    alert(`الرجاء تحديد اسم الحساب للطرف رقم ${i + 1}.`);
                    return;
                }
            }

            let sumDebit = 0, sumCredit = 0;
            this.tempJournalLines.forEach(l => {
                sumDebit += parseFloat(l.debit) || 0;
                sumCredit += parseFloat(l.credit) || 0;
            });

            sumDebit = parseFloat(sumDebit.toFixed(2));
            sumCredit = parseFloat(sumCredit.toFixed(2));

            if (sumDebit <= 0 && sumCredit <= 0) {
                alert('الرجاء إدخال مبالغ للقيد المحاسبي.');
                return;
            }

            const diff = Math.abs(sumDebit - sumCredit);
            if (diff >= 0.01) {
                alert(`القيد غير متوازن!\nإجمالي المدين: ${sumDebit.toFixed(2)} ₪\nإجمالي الدائن: ${sumCredit.toFixed(2)} ₪\nالفرق: ${diff.toFixed(2)} ₪\nيجب أن يتساوى المدين مع الدائن لاعتماد القيد.`);
                return;
            }

            const entryData = {
                id: isEdit ? j.id : ('je_' + Date.now()),
                entryNumber: document.getElementById('jeNumber').value.trim() || curNumber,
                date: document.getElementById('jeDate').value || curDate,
                projectId: document.getElementById('jeProject').value,
                desc: desc,
                debitTotal: sumDebit,
                creditTotal: sumCredit,
                lines: this.tempJournalLines.map(l => ({
                    account: l.account.trim(),
                    debit: parseFloat(l.debit) || 0,
                    credit: parseFloat(l.credit) || 0
                }))
            };

            if (isEdit) {
                const idx = AppState.journalEntries.findIndex(x => x.id === j.id);
                if (idx !== -1) AppState.journalEntries[idx] = entryData;
            } else {
                AppState.journalEntries.unshift(entryData);
            }

            this.saveState();
            this.closeModal('genericModal');
            this.renderAccounting();
            alert(`✅ تم حفظ سند القيد (${entryData.entryNumber}) بنجاح!`);
        };

        this.openModal('genericModal');
    },

    renderJournalEntryLines() {
        const tbody = document.getElementById('jeLinesBody');
        if (!tbody) return;

        tbody.innerHTML = (this.tempJournalLines || []).map((l, idx) => `
            <tr>
                <td>
                    <input type="text" class="form-control" list="jeAccountSuggestions" value="${l.account || ''}" placeholder="اسم الحساب..." oninput="App.onJournalLineChange(${idx}, 'account', this.value)">
                </td>
                <td>
                    <input type="number" class="form-control text-primary font-bold" min="0" step="0.01" value="${l.debit || 0}" oninput="App.onJournalLineChange(${idx}, 'debit', this.value)">
                </td>
                <td>
                    <input type="number" class="form-control text-success font-bold" min="0" step="0.01" value="${l.credit || 0}" oninput="App.onJournalLineChange(${idx}, 'credit', this.value)">
                </td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-outline text-danger" onclick="App.removeJournalLine(${idx})" title="حذف هذا الطرف"><i class="fa-solid fa-times"></i></button>
                </td>
            </tr>
        `).join('');

        this.updateJournalEntryTotals();
    },

    onJournalLineChange(idx, field, value) {
        if (!this.tempJournalLines || !this.tempJournalLines[idx]) return;
        if (field === 'debit' || field === 'credit') {
            const val = parseFloat(value) || 0;
            this.tempJournalLines[idx][field] = val;
            if (val > 0) {
                const other = field === 'debit' ? 'credit' : 'debit';
                if (this.tempJournalLines[idx][other] > 0) {
                    this.tempJournalLines[idx][other] = 0;
                    const inputs = document.querySelectorAll(`#jeLinesBody tr:nth-child(${idx + 1}) input[type="number"]`);
                    if (inputs && inputs[field === 'debit' ? 1 : 0]) {
                        inputs[field === 'debit' ? 1 : 0].value = 0;
                    }
                }
            }
        } else {
            this.tempJournalLines[idx][field] = value;
        }
        this.updateJournalEntryTotals();
    },

    addJournalLine() {
        if (!this.tempJournalLines) this.tempJournalLines = [];
        this.tempJournalLines.push({ account: '', debit: 0, credit: 0 });
        this.renderJournalEntryLines();
    },

    removeJournalLine(idx) {
        if (!this.tempJournalLines) return;
        if (this.tempJournalLines.length <= 2) {
            alert('يجب أن يحتوي القيد على طرفين على الأقل.');
            return;
        }
        this.tempJournalLines.splice(idx, 1);
        this.renderJournalEntryLines();
    },

    updateJournalEntryTotals() {
        const notice = document.getElementById('jeBalanceNotice');
        if (!notice) return;

        let d = 0, c = 0;
        (this.tempJournalLines || []).forEach(l => {
            d += parseFloat(l.debit) || 0;
            c += parseFloat(l.credit) || 0;
        });

        d = parseFloat(d.toFixed(2));
        c = parseFloat(c.toFixed(2));
        const diff = Math.abs(d - c);
        const isBalanced = diff < 0.01 && d > 0;

        notice.style.background = isBalanced ? '#ecfdf5' : '#fef2f2';
        notice.style.border = isBalanced ? '1px solid #10b981' : '1px solid #f87171';
        notice.style.color = isBalanced ? '#065f46' : '#991b1b';

        notice.innerHTML = `
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <strong>إجمالي المدين:</strong> ${d.toFixed(2)} ₪ | 
                    <strong>إجمالي الدائن:</strong> ${c.toFixed(2)} ₪ | 
                    <strong>الفرق:</strong> ${diff.toFixed(2)} ₪
                </div>
                <div>
                    ${isBalanced 
                        ? '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> القيد متوازن ومطابق 100%</span>' 
                        : '<span class="badge badge-red"><i class="fa-solid fa-circle-exclamation"></i> القيد غير متوازن</span>'}
                </div>
            </div>
        `;
    },

    openTrialBalanceModal() {
        const modal = document.getElementById('genericModal');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');

        title.innerHTML = '<i class="fa-solid fa-scale-unbalanced-flip text-primary"></i> ميزان المراجعة العام الموحد';

        const map = {};
        const entries = this.filterProject(AppState.journalEntries);
        entries.forEach(e => {
            (e.lines || []).forEach(l => {
                if (!map[l.account]) map[l.account] = { d: 0, c: 0 };
                map[l.account].d += l.debit;
                map[l.account].c += l.credit;
            });
        });

        let totD = 0, totC = 0;
        let rows = '';
        for (const [acc, v] of Object.entries(map)) {
            totD += v.d;
            totC += v.c;
            rows += `<tr><td><strong>${acc}</strong></td><td>${v.d.toFixed(2)} ₪</td><td>${v.c.toFixed(2)} ₪</td></tr>`;
        }

        body.innerHTML = `
            <table class="data-table">
                <thead><tr><th>اسم الحساب</th><th>مجموع المدين</th><th>مجموع الدائن</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="3" class="text-center py-2">لا توجد حركات محاسبية مسجلة بعد</td></tr>'}</tbody>
                <tfoot>
                    <tr><th>المجموع الكلي</th><th class="text-primary">${totD.toFixed(2)} ₪</th><th class="text-success">${totC.toFixed(2)} ₪</th></tr>
                </tfoot>
            </table>
        `;

        submit.style.display = 'none';
        this.openModal('genericModal');
    },

    /* ========================================================
       11. التقارير المالية (Reports)
       ======================================================== */
    generateReport() {
        const type = document.getElementById('repSelectType').value;
        const head = document.getElementById('reportHead');
        const body = document.getElementById('reportContent');
        const foot = document.getElementById('reportFoot');
        const title = document.getElementById('reportHeaderTitle');

        if (type === 'profit_loss') {
            title.innerText = 'تقرير الأرباح والخسائر المقارن (P&L)';
            head.innerHTML = `<tr><th>البند المالي</th><th>المشروع 1</th><th>المشروع 2</th><th>الإجمالي الموحد</th></tr>`;

            const s1 = AppState.salesInvoices.filter(i => i.projectId === 'proj_01').reduce((s, i) => s + (i.totalAmount || 0), 0);
            const s2 = AppState.salesInvoices.filter(i => i.projectId === 'proj_02').reduce((s, i) => s + (i.totalAmount || 0), 0);

            let c1 = 0, c2 = 0;
            AppState.salesInvoices.forEach(inv => {
                (inv.items || []).forEach(it => {
                    if (inv.projectId === 'proj_01') c1 += ((it.costPrice || 0) * it.qty);
                    else c2 += ((it.costPrice || 0) * it.qty);
                });
            });

            const g1 = s1 - c1;
            const g2 = s2 - c2;

            body.innerHTML = `
                <tr><td>إجمالي إيراد المبيعات</td><td>${s1.toFixed(2)} ₪</td><td>${s2.toFixed(2)} ₪</td><td><strong>${(s1+s2).toFixed(2)} ₪</strong></td></tr>
                <tr><td>تكلفة البضاعة المباعة (COGS)</td><td class="text-danger">(${c1.toFixed(2)}) ₪</td><td class="text-danger">(${c2.toFixed(2)}) ₪</td><td class="text-danger"><strong>(${ (c1+c2).toFixed(2) }) ₪</strong></td></tr>
                <tr style="background:var(--primary-soft);"><td><strong>صافي الربح التجاري</strong></td><td class="text-success"><strong>${g1.toFixed(2)} ₪</strong></td><td class="text-success"><strong>${g2.toFixed(2)} ₪</strong></td><td class="text-primary"><strong>${(g1+g2).toFixed(2)} ₪</strong></td></tr>
            `;
            foot.innerHTML = ``;
        } else if (type === 'inventory_val') {
            title.innerText = 'تقرير تقييم المخزون (بالتكلفة وسعر البيع)';
            head.innerHTML = `<tr><th>الصنف</th><th>المشروع</th><th>الكمية</th><th>التكلفة</th><th>إجمالي التكلفة</th><th>إجمالي سعر المفرق</th></tr>`;

            const prods = this.filterProject(AppState.products);
            let totCost = 0, totRetail = 0;
            body.innerHTML = prods.map(p => {
                const tc = p.stock * p.costPrice;
                const tr = p.stock * p.retailPrice;
                totCost += tc; totRetail += tr;
                return `<tr><td><strong>${p.name}</strong></td><td>${this.getProjectName(p.projectId)}</td><td>${p.stock}</td><td>${p.costPrice.toFixed(2)} ₪</td><td><strong>${tc.toFixed(2)} ₪</strong></td><td>${tr.toFixed(2)} ₪</td></tr>`;
            }).join('');

            foot.innerHTML = `<tr><th colspan="4">إجمالي قيمة المخزون</th><th class="text-primary">${totCost.toFixed(2)} ₪</th><th>${totRetail.toFixed(2)} ₪</th></tr>`;
        } else {
            title.innerText = 'كشف وتوزيع السيولة في الحسابات الأربعة المشتركة';
            head.innerHTML = `<tr><th>اسم الحساب</th><th>النوع</th><th>الرصيد الفعلي الإجمالي</th><th>حصة المشروع 1</th><th>حصة المشروع 2</th></tr>`;
            let totalLiquidity = 0;
            body.innerHTML = AppState.accounts.map(a => {
                totalLiquidity += a.balance;
                return `<tr><td><strong>${a.name}</strong></td><td>${a.type}</td><td><strong class="text-primary">${a.balance.toFixed(2)} ₪</strong></td><td>${((a.allocations && a.allocations.proj_01) || 0).toFixed(2)} ₪</td><td>${((a.allocations && a.allocations.proj_02) || 0).toFixed(2)} ₪</td></tr>`;
            }).join('');
            foot.innerHTML = `<tr><th colspan="2">مجموع السيولة النقدية والبنكية</th><th colspan="3" class="text-success">${totalLiquidity.toFixed(2)} ₪</th></tr>`;
        }
    },

    exportReportExcel() {
        const table = document.getElementById('reportOutputTable');
        if (!table) return;
        const html = table.outerHTML.replace(/ /g, '%20');
        const a = document.createElement('a');
        a.href = 'data:application/vnd.ms-excel,' + html;
        a.download = 'ERP_Report.xls';
        a.click();
    },

    /* ========================================================
       المودال العام
       ======================================================== */
    openModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('active');
    },

    closeModal(id) {
        const m = document.getElementById(id);
        if (m) {
            m.classList.remove('active');
            const submit = document.getElementById('genModalSubmitBtn');
            if (submit) submit.style.display = 'inline-flex';
        }
    }
};

// بدء التشغيل فور اكتمال المستند
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
