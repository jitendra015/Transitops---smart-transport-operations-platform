// ===== CONFIG =====
const API_BASE = '/api';
let currentUser = null;
let allData = {
    vehicles: [],
    drivers: [],
    trips: [],
    maintenance: [],
    fuelLogs: [],
    expenses: []
};

// ===== AUTH =====
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data;
            showApp();
            showToast('Welcome, ' + data.name);
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (err) {
        showToast('Server error', 'error');
    }
});

function fillLogin(email) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = 'password123';
}

async function logout() {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-role').textContent = currentUser.role.replace(/([A-Z])/g, ' ₹1').trim();
    refreshData();
}

// ===== NAVIGATION =====
function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1).replace('-', ' ');

    if (viewName === 'dashboard') loadDashboard();
    if (viewName === 'vehicles') loadVehicles();
    if (viewName === 'drivers') loadDrivers();
    if (viewName === 'trips') loadTrips();
    if (viewName === 'maintenance') loadMaintenance();
    if (viewName === 'fuel-expenses') loadFuelExpenses();
    if (viewName === 'reports') loadReports();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
}

// ===== MODALS =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'trip-modal') loadTripDropdowns();
    if (id === 'maintenance-modal') loadMaintDropdowns();
    if (id === 'fuel-modal') loadFuelDropdowns();
    if (id === 'expense-modal') loadExpenseDropdowns();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.querySelector(`#${id} form`)?.reset();
}

// Close modal on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
    });
});

// ===== TOAST =====
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.querySelector('i').className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.querySelector('i').style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== DATA LOADING =====
async function refreshData() {
    await Promise.all([
        fetchVehicles(),
        fetchDrivers(),
        fetchTrips(),
        fetchMaintenance(),
        fetchFuelLogs(),
        fetchExpenses()
    ]);
    loadDashboard();
}

async function fetchVehicles() {
    const res = await fetch(`${API_BASE}/vehicles`);
    allData.vehicles = await res.json();
}

async function fetchDrivers() {
    const res = await fetch(`${API_BASE}/drivers`);
    allData.drivers = await res.json();
}

async function fetchTrips() {
    const res = await fetch(`${API_BASE}/trips`);
    allData.trips = await res.json();
}

async function fetchMaintenance() {
    const res = await fetch(`${API_BASE}/maintenance`);
    allData.maintenance = await res.json();
}

async function fetchFuelLogs() {
    const res = await fetch(`${API_BASE}/fuel-logs`);
    allData.fuelLogs = await res.json();
}

async function fetchExpenses() {
    const res = await fetch(`${API_BASE}/expenses`);
    allData.expenses = await res.json();
}

// ===== DASHBOARD =====
async function loadDashboard() {
    const res = await fetch(`${API_BASE}/dashboard/kpis`);
    const kpis = await res.json();

    document.getElementById('kpi-active-vehicles').textContent = kpis.activeVehicles;
    document.getElementById('kpi-available-vehicles').textContent = kpis.availableVehicles;
    document.getElementById('kpi-maintenance').textContent = kpis.inMaintenance;
    document.getElementById('kpi-active-trips').textContent = kpis.activeTrips;
    document.getElementById('kpi-pending-trips').textContent = kpis.pendingTrips;
    document.getElementById('kpi-drivers-duty').textContent = kpis.driversOnDuty;
    document.getElementById('kpi-total-drivers').textContent = kpis.totalDrivers;
    document.getElementById('kpi-utilization').textContent = kpis.fleetUtilization + '%';

    // Recent trips
    const recentTrips = allData.trips.slice(0, 5);
    const tbody = document.getElementById('dashboard-trips');
    tbody.innerHTML = recentTrips.map(t => `
        <tr>
            <td><strong>${t.source}</strong> → ${t.destination}</td>
            <td>${t.vehicle_reg}</td>
            <td>${t.driver_name}</td>
            <td><span class="status-badge status-${t.status.toLowerCase().replace(' ', '-')}">${t.status}</span></td>
        </tr>
    `).join('');

    // Alerts
    const alerts = [];
    const expiredDrivers = allData.drivers.filter(d => new Date(d.license_expiry) < new Date() && d.status !== 'Suspended');
    expiredDrivers.forEach(d => alerts.push({ type: 'danger', text: `License expired: ${d.name}` }));

    const expiringSoon = allData.drivers.filter(d => {
        const days = Math.ceil((new Date(d.license_expiry) - new Date()) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 30 && d.status !== 'Suspended';
    });
    expiringSoon.forEach(d => alerts.push({ type: 'warning', text: `License expiring soon: ${d.name}` }));

    const inMaint = allData.vehicles.filter(v => v.status === 'In Shop');
    inMaint.forEach(v => alerts.push({ type: 'info', text: `In maintenance: ${v.reg_number}` }));

    const alertsDiv = document.getElementById('dashboard-alerts');
    if (alerts.length === 0) {
        alertsDiv.innerHTML = '<div class="alert-item info"><i class="fas fa-check"></i> All systems operational</div>';
    } else {
        alertsDiv.innerHTML = alerts.map(a => `
            <div class="alert-item ${a.type}">
                <i class="fas fa-${a.type === 'danger' ? 'exclamation-circle' : a.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                ${a.text}
            </div>
        `).join('');
    }
}

// ===== VEHICLES =====
function loadVehicles() {
    const tbody = document.getElementById('vehicles-table');
    const search = document.getElementById('vehicle-search').value.toLowerCase();
    const typeFilter = document.getElementById('vehicle-filter-type').value;
    const statusFilter = document.getElementById('vehicle-filter-status').value;

    let filtered = allData.vehicles.filter(v => {
        const matchSearch = !search || v.reg_number.toLowerCase().includes(search) || v.name.toLowerCase().includes(search);
        const matchType = !typeFilter || v.type === typeFilter;
        const matchStatus = !statusFilter || v.status === statusFilter;
        return matchSearch && matchType && matchStatus;
    });

    tbody.innerHTML = filtered.map(v => `
        <tr>
            <td><strong>${v.reg_number}</strong></td>
            <td>${v.name}</td>
            <td>${v.type}</td>
            <td>${v.max_load_capacity} kg</td>
            <td>${parseFloat(v.odometer).toLocaleString()} km</td>
            <td><span class="status-badge status-${v.status.toLowerCase().replace(' ', '-')}">${v.status}</span></td>
            <td>
                <div class="action-btns">
                    ${v.status !== 'Retired' ? `
                        <button class="btn btn-sm btn-secondary" onclick="editVehicle(${v.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="retireVehicle(${v.id})"><i class="fas fa-trash"></i></button>
                    ` : '<span class="text-muted">Retired</span>'}
                </div>
            </td>
        </tr>
    `).join('');
}

function filterVehicles() { loadVehicles(); }

async function saveVehicle(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Vehicle added successfully');
        closeModal('vehicle-modal');
        await fetchVehicles();
        loadVehicles();
    } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add vehicle', 'error');
    }
}

async function retireVehicle(id) {
    if (!confirm('Retire this vehicle?')) return;
    await fetch(`${API_BASE}/vehicles/${id}`, { method: 'DELETE' });
    showToast('Vehicle retired');
    await fetchVehicles();
    loadVehicles();
}

function editVehicle(id) {
    const v = allData.vehicles.find(x => x.id === id);
    if (!v) return;
    // Simple prompt-based edit for hackathon
    const newName = prompt('Vehicle Name:', v.name);
    if (newName) {
        fetch(`${API_BASE}/vehicles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...v, name: newName, reg_number: v.reg_number, type: v.type, max_load_capacity: v.max_load_capacity, odometer: v.odometer, acquisition_cost: v.acquisition_cost, status: v.status })
        }).then(() => {
            showToast('Vehicle updated');
            fetchVehicles().then(loadVehicles);
        });
    }
}

// ===== DRIVERS =====
function loadDrivers() {
    const tbody = document.getElementById('drivers-table');
    const search = document.getElementById('driver-search').value.toLowerCase();
    const statusFilter = document.getElementById('driver-filter-status').value;

    let filtered = allData.drivers.filter(d => {
        const matchSearch = !search || d.name.toLowerCase().includes(search) || d.license_number.toLowerCase().includes(search);
        const matchStatus = !statusFilter || d.status === statusFilter;
        return matchSearch && matchStatus;
    });

    tbody.innerHTML = filtered.map(d => {
        const isExpired = new Date(d.license_expiry) < new Date();
        return `
        <tr>
            <td><strong>${d.name}</strong></td>
            <td>${d.license_number}</td>
            <td>${d.license_category}</td>
            <td class="${isExpired ? 'text-danger' : ''}">${d.license_expiry} ${isExpired ? '<i class="fas fa-exclamation-circle"></i>' : ''}</td>
            <td>${d.safety_score}</td>
            <td><span class="status-badge status-${d.status.toLowerCase().replace(' ', '-')}">${d.status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-sm btn-secondary" onclick="editDriver(${d.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="suspendDriver(${d.id})"><i class="fas fa-ban"></i></button>
                </div>
            </td>
        </tr>
    `}).join('');
}

function filterDrivers() { loadDrivers(); }

async function saveDriver(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Driver added successfully');
        closeModal('driver-modal');
        await fetchDrivers();
        loadDrivers();
    } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add driver', 'error');
    }
}

async function suspendDriver(id) {
    if (!confirm('Suspend this driver?')) return;
    await fetch(`${API_BASE}/drivers/${id}`, { method: 'DELETE' });
    showToast('Driver suspended');
    await fetchDrivers();
    loadDrivers();
}

function editDriver(id) {
    const d = allData.drivers.find(x => x.id === id);
    if (!d) return;
    const newName = prompt('Driver Name:', d.name);
    if (newName) {
        fetch(`${API_BASE}/drivers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...d, name: newName, license_number: d.license_number, license_category: d.license_category, license_expiry: d.license_expiry, contact: d.contact, safety_score: d.safety_score, status: d.status })
        }).then(() => {
            showToast('Driver updated');
            fetchDrivers().then(loadDrivers);
        });
    }
}

// ===== TRIPS =====
function loadTrips() {
    const tbody = document.getElementById('trips-table');
    const statusFilter = document.getElementById('trip-filter-status').value;

    let filtered = allData.trips.filter(t => !statusFilter || t.status === statusFilter);

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>#${t.id}</td>
            <td><strong>${t.source}</strong> → ${t.destination}</td>
            <td>${t.vehicle_reg}</td>
            <td>${t.driver_name}</td>
            <td>${t.cargo_weight} kg</td>
            <td>${t.planned_distance} km</td>
            <td><span class="status-badge status-${t.status.toLowerCase().replace(' ', '-')}">${t.status}</span></td>
            <td>
                <div class="action-btns">
                    ${t.status === 'Draft' ? `
                        <button class="btn btn-sm btn-primary" onclick="dispatchTrip(${t.id})"><i class="fas fa-paper-plane"></i> Dispatch</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTrip(${t.id})"><i class="fas fa-trash"></i></button>
                    ` : t.status === 'Dispatched' ? `
                        <button class="btn btn-sm btn-success" onclick="openCompleteModal(${t.id})"><i class="fas fa-check"></i> Complete</button>
                        <button class="btn btn-sm btn-warning" onclick="cancelTrip(${t.id})"><i class="fas fa-times"></i> Cancel</button>
                    ` : '<span class="text-muted">No actions</span>'}
                </div>
            </td>
        </tr>
    `).join('');
}

function filterTrips() { loadTrips(); }

async function loadTripDropdowns() {
    const [vRes, dRes] = await Promise.all([
        fetch(`${API_BASE}/vehicles/available`),
        fetch(`${API_BASE}/drivers/available`)
    ]);
    const vehicles = await vRes.json();
    const drivers = await dRes.json();

    document.getElementById('trip-vehicle-select').innerHTML = 
        '<option value="">Select Vehicle</option>' +
        vehicles.map(v => `<option value="${v.id}">${v.reg_number} - ${v.name} (Max: ${v.max_load_capacity}kg)</option>`).join('');

    document.getElementById('trip-driver-select').innerHTML = 
        '<option value="">Select Driver</option>' +
        drivers.map(d => `<option value="${d.id}">${d.name} - ${d.license_number}</option>`).join('');
}

async function saveTrip(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Trip created successfully');
        closeModal('trip-modal');
        await fetchTrips();
        loadTrips();
    } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create trip', 'error');
    }
}

async function dispatchTrip(id) {
    const res = await fetch(`${API_BASE}/trips/${id}/dispatch`, { method: 'PUT' });
    if (res.ok) {
        showToast('Trip dispatched');
        await Promise.all([fetchTrips(), fetchVehicles(), fetchDrivers()]);
        loadTrips();
        loadDashboard();
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

function openCompleteModal(id) {
    document.getElementById('complete-trip-id').value = id;
    openModal('complete-trip-modal');
}

async function completeTrip(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('complete-trip-id').value;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/trips/${id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Trip completed');
        closeModal('complete-trip-modal');
        await Promise.all([fetchTrips(), fetchVehicles(), fetchDrivers()]);
        loadTrips();
        loadDashboard();
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

async function cancelTrip(id) {
    if (!confirm('Cancel this trip?')) return;
    const res = await fetch(`${API_BASE}/trips/${id}/cancel`, { method: 'PUT' });
    if (res.ok) {
        showToast('Trip cancelled');
        await Promise.all([fetchTrips(), fetchVehicles(), fetchDrivers()]);
        loadTrips();
        loadDashboard();
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

async function deleteTrip(id) {
    if (!confirm('Delete this draft trip?')) return;
    await fetch(`${API_BASE}/trips/${id}`, { method: 'DELETE' });
    showToast('Trip deleted');
    await fetchTrips();
    loadTrips();
}

// ===== MAINTENANCE =====
function loadMaintenance() {
    const tbody = document.getElementById('maintenance-table');
    tbody.innerHTML = allData.maintenance.map(m => `
        <tr>
            <td><strong>${m.reg_number}</strong><br><small>${m.vehicle_name}</small></td>
            <td>${m.description}</td>
            <td>₹${m.cost}</td>
            <td><span class="status-badge status-${m.status.toLowerCase()}">${m.status}</span></td>
            <td>${new Date(m.created_at).toLocaleDateString()}</td>
            <td>
                <div class="action-btns">
                    ${m.status === 'Active' ? `
                        <button class="btn btn-sm btn-success" onclick="closeMaintenance(${m.id})"><i class="fas fa-check"></i> Close</button>
                    ` : '<span class="text-muted">Closed</span>'}
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadMaintDropdowns() {
    const res = await fetch(`${API_BASE}/vehicles`);
    const vehicles = await res.json();
    document.getElementById('maint-vehicle-select').innerHTML = 
        '<option value="">Select Vehicle</option>' +
        vehicles.filter(v => v.status !== 'Retired').map(v => `<option value="${v.id}">${v.reg_number} - ${v.name}</option>`).join('');
}

async function saveMaintenance(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Maintenance record added');
        closeModal('maintenance-modal');
        await Promise.all([fetchMaintenance(), fetchVehicles()]);
        loadMaintenance();
        loadDashboard();
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

async function closeMaintenance(id) {
    const res = await fetch(`${API_BASE}/maintenance/${id}/close`, { method: 'PUT' });
    if (res.ok) {
        showToast('Maintenance closed');
        await Promise.all([fetchMaintenance(), fetchVehicles()]);
        loadMaintenance();
        loadDashboard();
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

// ===== FUEL & EXPENSES =====
function loadFuelExpenses() {
    const fuelTbody = document.getElementById('fuel-table');
    fuelTbody.innerHTML = allData.fuelLogs.map(f => `
        <tr>
            <td><strong>${f.reg_number}</strong><br><small>${f.vehicle_name}</small></td>
            <td>${f.liters} L</td>
            <td>₹${f.cost}</td>
            <td>${new Date(f.log_date).toLocaleDateString()}</td>
        </tr>
    `).join('');

    const expTbody = document.getElementById('expenses-table');
    expTbody.innerHTML = allData.expenses.map(e => `
        <tr>
            <td><span class="status-badge status-${e.type.toLowerCase()}">${e.type}</span></td>
            <td><strong>${e.reg_number}</strong></td>
            <td>₹${e.amount}</td>
            <td>${e.description || '-'}</td>
            <td>${new Date(e.expense_date).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

async function loadFuelDropdowns() {
    const res = await fetch(`${API_BASE}/vehicles`);
    const vehicles = await res.json();
    const opts = '<option value="">Select Vehicle</option>' +
        vehicles.filter(v => v.status !== 'Retired').map(v => `<option value="${v.id}">${v.reg_number} - ${v.name}</option>`).join('');
    document.getElementById('fuel-vehicle-select').innerHTML = opts;
}

async function loadExpenseDropdowns() {
    const res = await fetch(`${API_BASE}/vehicles`);
    const vehicles = await res.json();
    const opts = '<option value="">Select Vehicle</option>' +
        vehicles.filter(v => v.status !== 'Retired').map(v => `<option value="${v.id}">${v.reg_number} - ${v.name}</option>`).join('');
    document.getElementById('expense-vehicle-select').innerHTML = opts;
}

async function saveFuelLog(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/fuel-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Fuel log added');
        closeModal('fuel-modal');
        await fetchFuelLogs();
        loadFuelExpenses();
    } else {
        showToast('Failed to add fuel log', 'error');
    }
}

async function saveExpense(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const res = await fetch(`${API_BASE}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        showToast('Expense added');
        closeModal('expense-modal');
        await fetchExpenses();
        loadFuelExpenses();
    } else {
        showToast('Failed to add expense', 'error');
    }
}

// ===== REPORTS =====
async function loadReports() {
    // Fuel Efficiency
    const fuelRes = await fetch(`${API_BASE}/reports/fuel-efficiency`);
    const fuelData = await fuelRes.json();
    document.getElementById('report-fuel').innerHTML = fuelData.map(f => `
        <tr>
            <td><strong>${f.reg_number}</strong><br><small>${f.name}</small></td>
            <td>${f.total_distance} km</td>
            <td>${f.total_fuel} L</td>
            <td><strong>${f.efficiency}</strong> km/L</td>
        </tr>
    `).join('');

    // Operational Costs
    const costRes = await fetch(`${API_BASE}/reports/operational-cost`);
    const costData = await costRes.json();
    document.getElementById('report-costs').innerHTML = `
        <div class="cost-item">
            <h4>₹${parseFloat(costData.fuelCost).toLocaleString()}</h4>
            <p>Fuel Costs</p>
        </div>
        <div class="cost-item">
            <h4>₹${parseFloat(costData.maintenanceCost).toLocaleString()}</h4>
            <p>Maintenance</p>
        </div>
        <div class="cost-item">
            <h4>₹${parseFloat(costData.otherExpenses).toLocaleString()}</h4>
            <p>Other Expenses</p>
        </div>
        <div class="cost-item total">
            <h4>₹${parseFloat(costData.totalOperationalCost).toLocaleString()}</h4>
            <p>Total Operational Cost</p>
        </div>
    `;

    // Vehicle ROI
    const roiRes = await fetch(`${API_BASE}/reports/vehicle-roi`);
    const roiData = await roiRes.json();
    document.getElementById('report-roi').innerHTML = roiData.map(v => `
        <tr>
            <td><strong>${v.reg_number}</strong><br><small>${v.name}</small></td>
            <td>₹${parseFloat(v.revenue).toLocaleString()}</td>
            <td>₹${parseFloat(v.total_cost).toLocaleString()}</td>
            <td>₹${parseFloat(v.net_revenue).toLocaleString()}</td>
            <td><strong class="${v.roi >= 0 ? 'text-success' : 'text-danger'}">${v.roi}%</strong></td>
        </tr>
    `).join('');

    // Fleet Utilization
    const utilRes = await fetch(`${API_BASE}/reports/fleet-utilization`);
    const utilData = await utilRes.json();
    document.getElementById('report-utilization').innerHTML = `
        <div class="util-bar">
            <span class="util-bar-label">Active</span>
            <div class="util-bar-track">
                <div class="util-bar-fill" style="width: ${utilData.total > 0 ? (utilData.active / utilData.total * 100) : 0}%; background: var(--primary);">
                    ${utilData.active}
                </div>
            </div>
        </div>
        <div class="util-bar">
            <span class="util-bar-label">Available</span>
            <div class="util-bar-track">
                <div class="util-bar-fill" style="width: ${utilData.total > 0 ? (utilData.available / utilData.total * 100) : 0}%; background: var(--success);">
                    ${utilData.available}
                </div>
            </div>
        </div>
        <div class="util-bar">
            <span class="util-bar-label">Maint.</span>
            <div class="util-bar-track">
                <div class="util-bar-fill" style="width: ${utilData.total > 0 ? (utilData.maintenance / utilData.total * 100) : 0}%; background: var(--warning);">
                    ${utilData.maintenance}
                </div>
            </div>
        </div>
        <div style="margin-top: 16px; text-align: center;">
            <h2 style="font-size: 32px; color: var(--primary);">${utilData.utilizationRate}%</h2>
            <p style="color: var(--text-secondary);">Overall Fleet Utilization</p>
        </div>
    `;
}

// ===== CSV EXPORT =====
function exportCSV(reportType) {
    let csv = '';
    let filename = '';

    if (reportType === 'fuel-efficiency') {
        filename = 'fuel-efficiency.csv';
        csv = 'Vehicle,Type,Distance (km),Fuel (L),Efficiency (km/L)\n';
        fetch(`${API_BASE}/reports/fuel-efficiency`)
            .then(r => r.json())
            .then(data => {
                data.forEach(row => {
                    csv += `${row.reg_number},${row.type},${row.total_distance},${row.total_fuel},${row.efficiency}\n`;
                });
                downloadCSV(csv, filename);
            });
    } else if (reportType === 'vehicle-roi') {
        filename = 'vehicle-roi.csv';
        csv = 'Vehicle,Acquisition Cost,Revenue,Costs,Net Revenue,ROI %\n';
        fetch(`${API_BASE}/reports/vehicle-roi`)
            .then(r => r.json())
            .then(data => {
                data.forEach(row => {
                    csv += `${row.reg_number},${row.acquisition_cost},${row.revenue},${row.total_cost},${row.net_revenue},${row.roi}\n`;
                });
                downloadCSV(csv, filename);
            });
    }
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast('CSV exported');
}

// ===== DARK MODE =====
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const icon = document.querySelector('.top-actions .fa-moon');
    if (icon) {
        icon.classList.toggle('fa-moon');
        icon.classList.toggle('fa-sun');
    }
}

// ===== INIT =====
// Check if already logged in
fetch(`${API_BASE}/auth/me`)
    .then(r => r.json())
    .then(data => {
        if (data.id) {
            currentUser = data;
            showApp();
        }
    })
    .catch(() => {});
