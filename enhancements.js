/* Mobile layout and selected-project payroll extension for m7md. */
(function () {
    'use strict';

    if (!Array.isArray(AppState.payrollRecords)) AppState.payrollRecords = [];

    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 992px) {
            .topbar { height: auto; min-height: var(--header-h); flex-wrap: wrap; gap: .5rem; padding: .55rem .75rem; }
            .topbar-right, .topbar-left { min-width: 0; flex-wrap: wrap; }
            .topbar-left { justify-content: flex-end; }
            .project-switch-badge { max-width: calc(100vw - 90px); }
            .project-switch-badge select { max-width: min(58vw, 260px); }
            .page-header > .d-flex, .page-header > div.d-flex { flex-wrap: wrap; }
            .content-area { min-width: 0; }
            .modal-overlay { padding: .5rem; }
        }
        @media (max-width: 640px) {
            .topbar { align-items: flex-start; }
            .topbar-right { width: 100%; }
            .topbar-left { width: 100%; justify-content: space-between; }
            .project-switch-badge { flex: 1; min-width: 0; }
            .project-switch-badge select { flex: 1; min-width: 0; max-width: none; }
            .page-header { align-items: stretch; }
            .page-header > button, .page-header > .d-flex .btn { max-width: 100%; }
            .page-header > .d-flex { width: 100%; }
            .payroll-summary { grid-template-columns: 1fr !important; }
            .payroll-form-grid { grid-template-columns: 1fr !important; }
            .payroll-actions { flex-wrap: wrap; }
        }
        .payroll-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1rem; }
        .payroll-stat { background: var(--bg-surface, var(--bg-subtle)); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .85rem; }
        .payroll-stat small { display:block; color: var(--text-muted); }
        .payroll-stat strong { display:block; margin-top:.2rem; font-size:1.1rem; }
        .payroll-form-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:.75rem; }
        .payroll-actions { display:flex; gap:.35rem; }
        .sidebar[aria-hidden="true"] { visibility: hidden; }
        @media (max-width: 992px) { .sidebar.open[aria-hidden="true"] { visibility: visible; } }
    `;
    document.head.appendChild(style);

    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggleBtn');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.setAttribute('aria-hidden', window.innerWidth <= 992 ? 'true' : 'false');
    if (toggle) {
        toggle.setAttribute('aria-label', 'إظهار أو إخفاء القائمة الجانبية');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
            const open = !!sidebar?.classList.contains('open');
            toggle.setAttribute('aria-expanded', String(open));
            if (sidebar) sidebar.setAttribute('aria-hidden', String(window.innerWidth <= 992 && !open));
        });
    }
    if (backdrop) backdrop.addEventListener('click', () => {
        if (sidebar) sidebar.setAttribute('aria-hidden', 'true');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar?.classList.contains('open')) {
            sidebar.classList.remove('open');
            backdrop?.classList.remove('active');
            sidebar.setAttribute('aria-hidden', 'true');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });
    window.addEventListener('resize', () => {
        if (!sidebar) return;
        if (window.innerWidth > 992) {
            sidebar.setAttribute('aria-hidden', 'false');
            sidebar.classList.remove('open');
            backdrop?.classList.remove('active');
            toggle?.setAttribute('aria-expanded', 'false');
        } else if (!sidebar.classList.contains('open')) {
            sidebar.setAttribute('aria-hidden', 'true');
        }
    });

    const menu = document.querySelector('.sidebar-menu');
    const usersMenu = document.getElementById('menuItemUsers');
    const payrollLink = document.createElement('a');
    payrollLink.className = 'menu-item admin-only-element';
    payrollLink.dataset.page = 'payroll';
    payrollLink.id = 'menuItemPayroll';
    payrollLink.innerHTML = '<i class="fa-solid fa-money-check-dollar"></i> رواتب الموظفين';
    if (menu && usersMenu) menu.insertBefore(payrollLink, usersMenu);

    const content = document.querySelector('.content-area');
    if (content) {
        const section = document.createElement('section');
        section.className = 'page-view';
        section.id = 'page-payroll';
        section.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-money-check-dollar text-primary"></i> رواتب الموظفين</h1>
                    <p class="page-desc">سجل الرواتب محصور بالمشروع المحدد من نطاق العمل فقط.</p>
                </div>
                <button class="btn btn-primary" id="addPayrollBtn" type="button"><i class="fa-solid fa-plus"></i> إضافة راتب</button>
            </div>
            <div id="payrollProjectNotice" class="card p-3" style="display:none;"></div>
            <div id="payrollProjectContent" style="display:none;">
                <div class="payroll-summary">
                    <div class="payroll-stat"><small>مجموع الرواتب للمشروع</small><strong id="payrollTotal">0.00 ₪</strong></div>
                    <div class="payroll-stat"><small>المدفوع</small><strong id="payrollPaidTotal" class="text-success">0.00 ₪</strong></div>
                    <div class="payroll-stat"><small>المتبقي</small><strong id="payrollDueTotal" class="text-danger">0.00 ₪</strong></div>
                </div>
                <div class="card"><div class="table-responsive">
                    <table class="data-table"><thead><tr><th>الموظف</th><th>الفترة</th><th>الراتب</th><th>الحالة</th><th>تاريخ الدفع</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
                    <tbody id="payrollTableBody"></tbody></table>
                </div></div>
            </div>`;
        content.appendChild(section);
        section.querySelector('#addPayrollBtn').addEventListener('click', () => App.openPayrollModal());
    }

    const isAdmin = () => App.currentUser?.role === 'admin' || !!App.currentUser?.permissions?.isSuperAdmin;
    const currentProjectId = () => {
        const user = App.currentUser;
        if (user?.role === 'employee' && !user.permissions?.canViewAllProjects) return user.assignedProject;
        return AppState.currentProject;
    };
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);

    App.renderPayroll = function () {
        const notice = document.getElementById('payrollProjectNotice');
        const area = document.getElementById('payrollProjectContent');
        if (!notice || !area) return;
        if (!isAdmin()) {
            notice.style.display = 'block';
            area.style.display = 'none';
            notice.textContent = 'هذا القسم متاح للمدير العام فقط.';
            return;
        }
        const projectId = currentProjectId();
        if (!projectId || projectId === 'all') {
            notice.style.display = 'block';
            area.style.display = 'none';
            notice.innerHTML = '<i class="fa-solid fa-circle-info text-primary"></i> اختر مشروعاً محدداً من قائمة نطاق العمل لعرض رواتبه أو إدارتها. لا تُعرض الرواتب في نطاق كافة المشاريع.';
            return;
        }
        notice.style.display = 'none';
        area.style.display = 'block';
        const records = (AppState.payrollRecords || []).filter(record => record.projectId === projectId);
        const total = records.reduce((sum, record) => sum + safeNum(record.amount), 0);
        const paid = records.filter(record => record.status === 'paid').reduce((sum, record) => sum + safeNum(record.amount), 0);
        const due = total - paid;
        document.getElementById('payrollTotal').textContent = `${formatMoney(total)} ₪`;
        document.getElementById('payrollPaidTotal').textContent = `${formatMoney(paid)} ₪`;
        document.getElementById('payrollDueTotal').textContent = `${formatMoney(due)} ₪`;
        const tbody = document.getElementById('payrollTableBody');
        tbody.innerHTML = records.map(record => `
            <tr>
                <td><strong>${esc(record.employeeName)}</strong></td>
                <td>${esc(record.period)}</td>
                <td><strong>${formatMoney(record.amount)} ₪</strong></td>
                <td>${record.status === 'paid' ? '<span class="badge badge-green">مدفوع</span>' : '<span class="badge badge-amber">غير مدفوع</span>'}</td>
                <td>${esc(record.paymentDate || '—')}</td>
                <td>${esc(record.notes || '—')}</td>
                <td><div class="payroll-actions">
                    <button class="btn btn-sm btn-outline" type="button" title="تعديل" onclick="App.openPayrollModal('${esc(record.id)}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline text-danger" type="button" title="حذف" onclick="App.deletePayrollRecord('${esc(record.id)}')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('') || '<tr><td colspan="7" class="text-center py-4 text-muted">لا توجد رواتب مسجلة لهذا المشروع.</td></tr>';
    };

    App.openPayrollModal = function (recordId = null) {
        if (!isAdmin()) { alert('إدارة الرواتب مخصصة للمدير العام فقط.'); return; }
        const projectId = currentProjectId();
        if (!projectId || projectId === 'all') { alert('اختر مشروعاً محدداً أولاً.'); return; }
        const existing = recordId ? (AppState.payrollRecords || []).find(item => item.id === recordId && item.projectId === projectId) : null;
        if (recordId && !existing) { alert('سجل الراتب غير موجود ضمن المشروع المحدد.'); return; }
        const projectEmployees = (AppState.systemUsers || []).filter(user => user.assignedProject === projectId);
        const employeeOptions = projectEmployees.map(user => `<option value="${esc(user.name || user.username)}" ${existing?.employeeName === (user.name || user.username) ? 'selected' : ''}>${esc(user.name || user.username)}</option>`).join('');
        const title = document.getElementById('genModalTitle');
        const body = document.getElementById('genModalBody');
        const submit = document.getElementById('genModalSubmitBtn');
        title.innerHTML = `<i class="fa-solid fa-money-check-dollar text-primary"></i> ${existing ? 'تعديل سجل راتب' : 'إضافة راتب'} — ${esc(App.getProjectName(projectId))}`;
        body.innerHTML = `
            <div class="payroll-form-grid">
                <div class="form-group"><label class="form-label">المشروع:</label><input class="form-control" value="${esc(App.getProjectName(projectId))}" disabled></div>
                <div class="form-group"><label class="form-label">اسم الموظف:</label>
                    ${employeeOptions ? `<select id="payrollEmployee" class="form-control"><option value="">اختر موظفاً...</option>${employeeOptions}</select>` : '<input id="payrollEmployee" class="form-control" type="text" placeholder="اكتب اسم الموظف">'}
                </div>
                <div class="form-group"><label class="form-label">الفترة (شهر/سنة):</label><input id="payrollPeriod" class="form-control" type="month" value="${esc(existing?.period || new Date().toISOString().slice(0, 7))}"></div>
                <div class="form-group"><label class="form-label">مبلغ الراتب (₪):</label><input id="payrollAmount" class="form-control" type="number" min="0.01" step="0.01" value="${existing ? safeNum(existing.amount) : ''}" placeholder="0.00"></div>
                <div class="form-group"><label class="form-label">الحالة:</label><select id="payrollStatus" class="form-control"><option value="unpaid" ${!existing || existing.status !== 'paid' ? 'selected' : ''}>غير مدفوع</option><option value="paid" ${existing?.status === 'paid' ? 'selected' : ''}>مدفوع</option></select></div>
                <div class="form-group"><label class="form-label">تاريخ الدفع:</label><input id="payrollPaymentDate" class="form-control" type="date" value="${esc(existing?.paymentDate || '')}"></div>
                <div class="form-group" style="grid-column:1/-1"><label class="form-label">ملاحظات:</label><input id="payrollNotes" class="form-control" type="text" maxlength="300" value="${esc(existing?.notes || '')}" placeholder="اختياري"></div>
            </div>`;
        submit.style.display = 'inline-flex';
        submit.textContent = existing ? 'حفظ التعديلات' : 'حفظ الراتب';
        submit.onclick = () => {
            if (!navigator.onLine) { alert('لا يمكن حفظ الراتب أثناء انقطاع الإنترنت.'); return; }
            if (!isAdmin() || currentProjectId() !== projectId) { alert('غير مصرح أو تغير المشروع المحدد. لم يتم الحفظ.'); return; }
            const employeeName = document.getElementById('payrollEmployee')?.value.trim();
            const period = document.getElementById('payrollPeriod')?.value;
            const amount = safeNum(document.getElementById('payrollAmount')?.value, -1);
            if (!employeeName || !period || amount <= 0) { alert('أدخل اسم الموظف والفترة وراتباً أكبر من صفر.'); return; }
            const status = document.getElementById('payrollStatus').value;
            const paymentDate = document.getElementById('payrollPaymentDate').value;
            if (status === 'paid' && !paymentDate) { alert('أدخل تار��خ الدفع للراتب المدفوع.'); return; }
            const item = { id: existing?.id || `pay_${Date.now()}`, projectId, employeeName, period, amount, status, paymentDate: status === 'paid' ? paymentDate : '', notes: document.getElementById('payrollNotes').value.trim(), updatedAt: new Date().toISOString() };
            if (!Array.isArray(AppState.payrollRecords)) AppState.payrollRecords = [];
            if (existing) AppState.payrollRecords = AppState.payrollRecords.map(record => record.id === existing.id && record.projectId === projectId ? item : record);
            else AppState.payrollRecords.unshift(item);
            if (App.saveState() === false) return;
            App.closeModal('genericModal');
            App.renderPayroll();
        };
        App.openModal('genericModal');
    };

    App.deletePayrollRecord = function (recordId) {
        if (!isAdmin()) { alert('حذف سجلات الرواتب مخصص للمدير العام فقط.'); return; }
        if (!navigator.onLine) { alert('لا يمكن حذف الراتب أثناء انقطاع الإنترنت.'); return; }
        const projectId = currentProjectId();
        const record = (AppState.payrollRecords || []).find(item => item.id === recordId && item.projectId === projectId);
        if (!record) { alert('سجل الراتب غير موجود ضمن المشروع المحدد.'); return; }
        if (!confirm(`هل تريد حذف راتب ${record.employeeName} للفترة ${record.period}؟`)) return;
        AppState.payrollRecords = AppState.payrollRecords.filter(item => !(item.id === recordId && item.projectId === projectId));
        if (App.saveState() === false) return;
        App.renderPayroll();
    };

    const originalNavigate = App.navigateTo.bind(App);
    App.navigateTo = function (pageName) {
        if (pageName === 'payroll' && !isAdmin()) { alert('قسم الرواتب مخصص للمدير العام فقط.'); return; }
        originalNavigate(pageName);
        if (pageName === 'payroll') this.renderPayroll();
    };

    const originalRenderAll = App.renderAll.bind(App);
    App.renderAll = function (...args) {
        originalRenderAll(...args);
        this.renderPayroll();
    };

    const originalPermissions = App.applyUserPermissions.bind(App);
    App.applyUserPermissions = function (...args) {
        originalPermissions(...args);
        const link = document.getElementById('menuItemPayroll');
        if (link) link.style.display = isAdmin() ? '' : 'none';
    };
})();
