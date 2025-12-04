(() => {
    const q = sel => document.querySelector(sel); // Shorted code since it's used a million times
    const api = async (action, method = 'GET', body = null) => {
        const opts = { method, headers: {} };
        let url = `/?action=${encodeURIComponent(action)}`;
        if (method === 'GET') {
            if (body && typeof body === 'object') {
                url += '&' + new URLSearchParams(body).toString();
            }
        } else {
            opts.body = new URLSearchParams(body || {});
        }
        const res = await fetch(url, opts);
        return res.json();
    };

    // state
    let state = { students: [], activities: [], attendance: {} };
    let selectedActivity = null;
    let selectedWeekStart = null;
    let focusedRow = 0;
    let selectedStudentIds = new Set();

    // UI elements
    const activitiesList = q('#activitiesList');
    const addActivityBtn = q('#addActivityBtn');
    const weekStartInput = q('#weekStart');
    const registerArea = q('#registerArea');
    const statsArea = q('#statsArea');
    const settingsArea = q('#settingsArea');
    const navStats = q('#navStats');
    const navSettings = q('#navSettings');
    const activityTitle = q('#activityTitle');
    const activityDescription = q('#activityDescription');
    const editActivityBtn = q('#editActivityBtn');
    const toggleThemeBtn = q('#toggleTheme');

    // Stats Elements
    const statTotalStudents = q('#statTotalStudents');
    const statTotalActivities = q('#statTotalActivities');
    const statTotalAttendance = q('#statTotalAttendance');
    const statsTable = q('#statsTable tbody');
    const statsActivitiesTable = q('#statsActivitiesTable tbody');
    const statsYearGroupsTable = q('#statsYearGroupsTable tbody');
    const statsDepartmentsTable = q('#statsDepartmentsTable tbody');
    const statsSearch = q('#statsSearch');
    const downloadCsvBtn = q('#downloadCsvBtn');
    let chartWeekly = null;
    let chartActivities = null;
    let statsData = null;

    // Settings Elements
    const settingsStudentsTable = q('#settingsStudentsTable tbody');
    const selectAllStudents = q('#selectAllStudents');
    const massDeleteBtn = q('#massDeleteBtn');
    const massAddToActivityBtn = q('#massAddToActivityBtn');
    const addToActivityModal = q('#addToActivityModal');
    const addToActivityForm = q('#addToActivityForm');
    const targetActivitySelect = q('#targetActivitySelect');
    const selectedCountText = q('#selectedCountText');

    // Modal elements
    const createStudentBtn = q('#createStudentBtn');
    const assignStudentBtn = q('#assignStudentBtn');
    const assignStudentModal = q('#assignStudentModal');
    const assignStudentForm = q('#assignStudentForm');
    const assignStudentTags = q('#assignStudentTags');
    const assignStudentAddBtn = q('#assignStudentAddBtn');
    const assignStudentDropdown = q('#assignStudentDropdown');
    const assignStudentSearch = q('#assignStudentSearch');
    const assignStudentList = q('#assignStudentList');

    const studentModal = q('#studentModal');
    const studentForm = q('#studentForm');
    const studentIdInput = q('#studentIdInput');
    const firstNameInput = q('#firstName');
    const lastNameInput = q('#lastName');
    const studentYearGroup = q('#studentYearGroup');
    const studentModalTitle = q('#studentModalTitle');
    const saveStudentBtn = q('#saveStudentBtn');
    const deleteStudentBtn = q('#deleteStudentBtn');

    const activityModal = q('#activityModal');
    const activityForm = q('#activityForm');
    const activityIdInput = q('#activityIdInput');
    const activityNameInput = q('#activityNameInput');
    const activityDescriptionInput = q('#activityDescriptionInput');
    const activityDepartmentInput = q('#activityDepartmentInput');
    const activitySessionsInput = q('#activitySessions');
    const activityModalTitle = q('#activityModalTitle');
    const saveActivityBtn = q('#saveActivityBtn');
    const deleteActivityBtn = q('#deleteActivityBtn');

    const closeModalBtns = document.querySelectorAll('.close-modal');

    function isoMonday(d = new Date()) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date.toISOString().slice(0, 10);
    }

    async function loadState() {
        const res = await api('get_state');
        if (res.error) return alert(res.error);
        state.students = res.students;
        state.activities = res.activities;
        renderActivities();
        if (!selectedWeekStart) selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;

        // If settings is active, re-render settings
        if (settingsArea.style.display !== 'none') {
            renderSettings();
        }

        // If we are in stats mode, don't auto-select activity
        if (registerArea.style.display !== 'none' && state.activities.length && !selectedActivity) {
            selectActivity(state.activities[0].id);
        }
    }

    function renderActivities() {
        activitiesList.innerHTML = '';
        state.activities.forEach(a => {
            const el = document.createElement('div');
            el.tabIndex = 0;
            el.className = 'nav-item' + (selectedActivity === a.id ? ' active' : '');
            el.innerHTML = `<span>${a.name}</span><span class="meta">${a.sessions_per_week}/wk</span>`;
            el.onclick = () => selectActivity(a.id);
            activitiesList.appendChild(el);
        });
    }

    async function selectActivity(id) {
        selectedActivity = id;
        registerArea.style.display = 'block';
        statsArea.style.display = 'none';
        settingsArea.style.display = 'none';
        navStats.classList.remove('active');
        navSettings.classList.remove('active');
        
        createStudentBtn.style.display = 'none';
        assignStudentBtn.style.display = 'flex';

        renderActivities();
        const act = state.activities.find(x => x.id == id);
        activityTitle.textContent = act ? act.name : 'Register';
        activityDescription.textContent = act ? (act.description || '') : '';
        if (act) {
            editActivityBtn.style.display = 'flex';
        } else {
            editActivityBtn.style.display = 'none';
        }
        await loadAttendance();
    }

    async function loadStats() {
        selectedActivity = null;
        renderActivities(); // Clear active state
        navStats.classList.add('active');
        navSettings.classList.remove('active');
        registerArea.style.display = 'none';
        statsArea.style.display = 'block';
        settingsArea.style.display = 'none';
        activityTitle.textContent = 'Statistics';
        activityDescription.textContent = '';
        editActivityBtn.style.display = 'none';
        createStudentBtn.style.display = 'none';
        assignStudentBtn.style.display = 'none';

        const res = await api('get_stats');
        if (res.error) return alert(res.error);
        statsData = res.stats;

        renderStatsDashboard();
    }

    function renderStatsDashboard() {
        if (!statsData) return;

        // KPI Cards
        statTotalStudents.textContent = state.students.length;
        statTotalActivities.textContent = state.activities.length;

        // Calculate total attendance
        const totalAtt = Object.values(statsData.students).reduce((a, b) => a + parseInt(b), 0);
        statTotalAttendance.textContent = totalAtt;

        // Charts
        renderCharts();

        // Table
        renderStatsTable();
        renderStatsActivitiesTable();
        renderStatsYearGroupsTable();
        renderStatsDepartmentsTable();
    }

    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });
    }

    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.toLowerCase();
        // sam was here

        state.students.forEach(s => {
            if (term && !s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    function renderStatsActivitiesTable() {
        statsActivitiesTable.innerHTML = '';
        
        state.activities.forEach(a => {
            const totalAttendance = statsData.activities[a.id] || 0;
            const numWeeks = statsData.weekly.length || 1;
            const avgPerWeek = (totalAttendance / numWeeks).toFixed(1);

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `
                <td>${a.name}</td>
                <td>${avgPerWeek}</td>
                <td>${totalAttendance}</td>
            `;
            tr.onclick = () => openActivityStats(a.id);
            statsActivitiesTable.appendChild(tr);
        });
    }

    function renderStatsYearGroupsTable() {
        statsYearGroupsTable.innerHTML = '';
        const groups = statsData.year_groups || {};
        
        // Sort keys (9, 10, 11...)
        Object.keys(groups).sort((a,b) => parseInt(a)-parseInt(b)).forEach(yg => {
            const count = groups[yg];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Year ${yg}</td>
                <td>${count}</td>
                <td><button class="btn-sm download-yg-btn" data-yg="${yg}">Download CSV</button></td>
            `;
            
            tr.querySelector('.download-yg-btn').onclick = async (e) => {
                e.stopPropagation();
                await downloadYearGroupCsv(yg);
            };
            
            statsYearGroupsTable.appendChild(tr);
        });
    }

    function renderStatsDepartmentsTable() {
        statsDepartmentsTable.innerHTML = '';
        const depts = statsData.departments || {};
        
        Object.keys(depts).sort().forEach(dept => {
            const count = depts[dept];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dept}</td>
                <td>${count}</td>
                <td><button class="btn-sm download-dept-btn" data-dept="${dept}">Download CSV</button></td>
            `;
            
            tr.querySelector('.download-dept-btn').onclick = async (e) => {
                e.stopPropagation();
                await downloadDepartmentCsv(dept);
            };
            
            statsDepartmentsTable.appendChild(tr);
        });
    }

    async function downloadYearGroupCsv(yearGroup) {
        const res = await api('get_year_group_export', 'GET', { year_group: yearGroup });
        if (res.error) return alert(res.error);
        processAndDownloadCsv(res.data, `Year_${yearGroup}_Report.csv`);
    }

    async function downloadDepartmentCsv(department) {
        const res = await api('get_department_export', 'GET', { department: department });
        if (res.error) return alert(res.error);
        processAndDownloadCsv(res.data, `${department}_Report.csv`);
    }

    function processAndDownloadCsv(rawData, filename) {
        // 1. Get all unique weeks and sort them
        const weeksSet = new Set();
        rawData.forEach(r => weeksSet.add(r.week_start));
        const weeks = Array.from(weeksSet).sort();
        
        // 2. Map attendance data
        const attendanceMap = {};
        rawData.forEach(r => {
            if (!attendanceMap[r.student_name]) {
                attendanceMap[r.student_name] = {
                    weeks: {},
                    total: 0
                };
            }
            const count = parseInt(r.count);
            attendanceMap[r.student_name].weeks[r.week_start] = count;
            attendanceMap[r.student_name].total += count;
        });

        // 3. Build CSV
        let csv = 'Student Name,' + weeks.map(w => `W/C ${formatCsvDate(w)}`).join(',') + ',Total Sessions Attended\n';
        
        // Sort students by name
        const studentNames = Object.keys(attendanceMap).sort();
        
        studentNames.forEach(name => {
            const data = attendanceMap[name];
            const weekCols = weeks.map(w => data.weeks[w] || 0).join(',');
            csv += `"${name}",${weekCols},${data.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    function loadSettings() {
        selectedActivity = null;
        renderActivities();
        navStats.classList.remove('active');
        navSettings.classList.add('active');
        registerArea.style.display = 'none';
        statsArea.style.display = 'none';
        settingsArea.style.display = 'block';
        activityTitle.textContent = 'Settings';
        activityDescription.textContent = '';
        editActivityBtn.style.display = 'none';
        createStudentBtn.style.display = 'flex';
        assignStudentBtn.style.display = 'none';
        
        selectedStudentIds.clear();
        renderSettings();
    }

    function renderSettings() {
        settingsStudentsTable.innerHTML = '';
        const allSelected = state.students.length > 0 && selectedStudentIds.size === state.students.length;
        selectAllStudents.checked = allSelected;
        selectAllStudents.indeterminate = selectedStudentIds.size > 0 && !allSelected;

        state.students.forEach((s, index) => {
            const tr = document.createElement('tr');
            const isSelected = selectedStudentIds.has(s.id);
            tr.innerHTML = `
                <td><input type="checkbox" class="student-checkbox" data-id="${s.id}" data-index="${index}" ${isSelected ? 'checked' : ''}></td>
                <td>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${s.name}</span>
                        <button class="icon-btn edit-student-btn" data-id="${s.id}" style="opacity:0.5; padding:4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                </td>
                <td style="color:var(--text-secondary); font-family:monospace;">${s.id}</td>
            `;
            
            // Add hover effect for edit button
            const btn = tr.querySelector('.edit-student-btn');
            btn.onmouseover = () => btn.style.opacity = '1';
            btn.onmouseout = () => btn.style.opacity = '0.5';
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent row click if we add one later
                openEditStudentModal(s);
            };

            settingsStudentsTable.appendChild(tr);
        });

        updateSettingsButtons();
    }

    function updateSettingsButtons() {
        const count = selectedStudentIds.size;
        massDeleteBtn.disabled = count === 0;
        massAddToActivityBtn.disabled = count === 0;
        selectedCountText.textContent = `${count} student${count !== 1 ? 's' : ''} selected`;
    }

    navSettings.addEventListener('click', loadSettings);

    selectAllStudents.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.students.forEach(s => selectedStudentIds.add(s.id));
        } else {
            selectedStudentIds.clear();
        }
        renderSettings();
    });

    let lastCheckedIndex = -1;

    settingsStudentsTable.addEventListener('change', (e) => {
        if (e.target.classList.contains('student-checkbox')) {
            const id = parseInt(e.target.dataset.id);
            const index = parseInt(e.target.dataset.index);
            const checked = e.target.checked;

            if (e.shiftKey && lastCheckedIndex !== -1) {
                const start = Math.min(lastCheckedIndex, index);
                const end = Math.max(lastCheckedIndex, index);
                
                for (let i = start; i <= end; i++) {
                    const s = state.students[i];
                    if (checked) {
                        selectedStudentIds.add(s.id);
                    } else {
                        selectedStudentIds.delete(s.id);
                    }
                }
            } else {
                if (checked) {
                    selectedStudentIds.add(id);
                } else {
                    selectedStudentIds.delete(id);
                }
            }
            
            lastCheckedIndex = index;
            renderSettings(); // Re-render to update header checkbox state and all checkboxes
        }
    });

    massDeleteBtn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete ${selectedStudentIds.size} students? This cannot be undone.`)) return;
        
        const ids = Array.from(selectedStudentIds);
        const res = await api('delete_students', 'POST', { ids: ids.join(',') });
        if (res.error) return alert(res.error);
        
        await loadState();
        loadSettings();
    });

    massAddToActivityBtn.addEventListener('click', () => {
        addToActivityModal.classList.add('active');
        targetActivitySelect.innerHTML = '<option value="">-- Select Activity --</option>';
        state.activities.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            targetActivitySelect.appendChild(opt);
        });
        updateSettingsButtons(); // Update count text
    });

    addToActivityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const activityId = parseInt(targetActivitySelect.value);
        if (!activityId) return;

        const activity = state.activities.find(a => a.id === activityId);
        if (!activity) return;

        // Merge students
        const currentIds = new Set(activity.student_ids || []);
        selectedStudentIds.forEach(id => currentIds.add(id));
        
        const newIds = Array.from(currentIds);
        
        const res = await api('update_activity', 'POST', {
            id: activity.id,
            name: activity.name,
            description: activity.description || '',
            sessions_per_week: activity.sessions_per_week,
            student_ids: newIds.join(',')
        });

        if (res.error) return alert(res.error);

        addToActivityModal.classList.remove('active');
        await loadState();
        alert(`Added students to ${activity.name}`);
    });

    navStats.addEventListener('click', loadStats);
    statsSearch.addEventListener('input', (e) => renderStatsTable(e.target.value));

    // Helper for CSV dates (YYYY-MM-DD -> DD-MM-YY)
    function formatCsvDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}-${m}-${y.slice(2)}`;
    }

    async function loadAttendance() {
        if (!selectedActivity) return;
        const res = await api('get_attendance', 'GET', { activity_id: selectedActivity, week_start: selectedWeekStart });
        state.attendance = res.attendance || {};
        renderRegister();
    }

    // Tag Management Logic
    let currentActivityStudentIds = [];
    const activityStudentTags = q('#activityStudentTags');
    const addStudentTagBtn = q('#addStudentTagBtn');
    const studentPickerDropdown = q('#studentPickerDropdown');
    const studentPickerSearch = q('#studentPickerSearch');
    const studentPickerList = q('#studentPickerList');

    function renderStudentTags() {
        // Clear existing tags but keep the add button
        const tags = activityStudentTags.querySelectorAll('.tag-chip');
        tags.forEach(t => t.remove());

        currentActivityStudentIds.forEach(sid => {
            const s = state.students.find(x => x.id == sid);
            if (!s) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
            <span>${s.name}</span>
            <span class="tag-remove" data-id="${sid}">&times;</span>
          `;
            chip.querySelector('.tag-remove').onclick = () => {
                currentActivityStudentIds = currentActivityStudentIds.filter(id => id !== sid);
                renderStudentTags();
            };
            activityStudentTags.insertBefore(chip, addStudentTagBtn);
        });
    }

    function renderStudentPicker(filter = '') {
        studentPickerList.innerHTML = '';
        const available = state.students.filter(s => !currentActivityStudentIds.includes(s.id));
        const filtered = available.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            studentPickerList.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:12px;">No students found</div>';
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = s.name;
            item.onclick = () => {
                currentActivityStudentIds.push(s.id);
                renderStudentTags();
                studentPickerDropdown.style.display = 'none';
                studentPickerSearch.value = '';
            };
            studentPickerList.appendChild(item);
        });
    }

    addStudentTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = addStudentTagBtn.getBoundingClientRect();
        // Position dropdown relative to button or container
        // Simple toggle for now
        const isVisible = studentPickerDropdown.style.display === 'flex';
        studentPickerDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            renderStudentPicker();
            studentPickerSearch.focus();
        }
    });

    studentPickerSearch.addEventListener('input', (e) => {
        renderStudentPicker(e.target.value);
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!studentPickerDropdown.contains(e.target) && e.target !== addStudentTagBtn) {
            studentPickerDropdown.style.display = 'none';
        }
    });

    // --- Assign Student Modal Logic ---
    let assignStudentIds = [];

    function renderAssignTags() {
        // Clear existing tags but keep the add button
        const tags = assignStudentTags.querySelectorAll('.tag-chip');
        tags.forEach(t => t.remove());

        assignStudentIds.forEach(sid => {
            const s = state.students.find(x => x.id == sid);
            if (!s) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
            <span>${s.name}</span>
            <span class="tag-remove" data-id="${sid}">&times;</span>
          `;
            chip.querySelector('.tag-remove').onclick = () => {
                assignStudentIds = assignStudentIds.filter(id => id !== sid);
                renderAssignTags();
            };
            assignStudentTags.insertBefore(chip, assignStudentAddBtn);
        });
    }

    function renderAssignPicker(filter = '') {
        assignStudentList.innerHTML = '';
        const available = state.students.filter(s => !assignStudentIds.includes(s.id));
        const filtered = available.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            assignStudentList.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:12px;">No students found</div>';
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = s.name;
            item.onclick = () => {
                assignStudentIds.push(s.id);
                renderAssignTags();
                assignStudentDropdown.style.display = 'none';
                assignStudentSearch.value = '';
            };
            assignStudentList.appendChild(item);
        });
    }

    assignStudentAddBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = assignStudentDropdown.style.display === 'flex';
        assignStudentDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            renderAssignPicker();
            assignStudentSearch.focus();
        }
    });

    assignStudentSearch.addEventListener('input', (e) => {
        renderAssignPicker(e.target.value);
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!assignStudentDropdown.contains(e.target) && e.target !== assignStudentAddBtn) {
            assignStudentDropdown.style.display = 'none';
        }
    });

    function renderRegister() {
        if (!selectedActivity) {
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            return;
        }
        const act = state.activities.find(x => x.id == selectedActivity);
        const sessions = act.sessions_per_week;

        // Filter students based on activity association
        // If student_ids is undefined (legacy), show all? Or show none?
        // Let's assume if the array exists, we filter. If it's missing, we show all (backward compat)
        // But we just added it to DB, so it will be empty array for existing activities.
        // User wants "only shows certain students". So empty array = no students.
        const activityStudents = (act.student_ids || []).map(id => state.students.find(s => s.id == id)).filter(Boolean);

        // Sort by name
        activityStudents.sort((a, b) => a.name.localeCompare(b.name));

        const table = document.createElement('table');
        table.className = 'students-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.innerHTML = `<th>Student</th>` + Array.from({ length: sessions }).map((_, i) => `<th>Session ${i + 1}</th>`).join('');
        thead.appendChild(headRow); table.appendChild(thead);
        const tbody = document.createElement('tbody');

        if (activityStudents.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="${sessions + 1}" style="text-align:center; color:var(--text-secondary); padding: 20px;">No students assigned to this activity. Edit activity to add students.</td>`;
            tbody.appendChild(tr);
        }

        activityStudents.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'student-row' + (idx === focusedRow ? ' focused' : '');

            const nameTd = document.createElement('td');

            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'space-between';
            wrapper.style.width = '100%';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = s.name;
            wrapper.appendChild(nameSpan);

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn';
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
            editBtn.style.opacity = '0.5';
            editBtn.style.padding = '4px';
            editBtn.onclick = (e) => { e.stopPropagation(); openEditStudentModal(s); };
            editBtn.onmouseover = () => editBtn.style.opacity = '1';
            editBtn.onmouseout = () => editBtn.style.opacity = '0.5';

            wrapper.appendChild(editBtn);
            nameTd.appendChild(wrapper);
            tr.appendChild(nameTd);

            for (let si = 1; si <= sessions; si++) {
                const td = document.createElement('td');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                const present = state.attendance[s.id] && state.attendance[s.id][si] === 1;
                cb.checked = !!present;
                cb.addEventListener('change', () => toggleAttendance(s.id, si, cb.checked));
                td.appendChild(cb);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        registerArea.innerHTML = '';
        registerArea.appendChild(table);
    }

    async function toggleAttendance(student_id, session_index, present) {
        await api('toggle_attendance', 'POST', { student_id, activity_id: selectedActivity, week_start: selectedWeekStart, session_index, present: present ? 1 : 0 });
        if (!state.attendance[student_id]) state.attendance[student_id] = {};
        state.attendance[student_id][session_index] = present ? 1 : 0;
    }

    activityForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = activityIdInput.value;
        const name = activityNameInput.value.trim();
        const description = activityDescriptionInput.value.trim();
        const department = activityDepartmentInput.value;
        const sessions = activitySessionsInput.value;

        if (!name) return;

        // Pass student_ids as comma separated string
        const studentIdsStr = currentActivityStudentIds.join(',');

        let res;
        if (id) {
            // Update
            res = await api('update_activity', 'POST', { id, name, description, department, sessions_per_week: sessions, student_ids: studentIdsStr });
        } else {
            // Create
            res = await api('create_activity', 'POST', { name, description, department, sessions_per_week: sessions, student_ids: studentIdsStr });
        }

        if (res.ok) {
            closeModal(activityModal);
            await loadState();
            if (id) {
                selectActivity(id); // Refresh current view
            } else {
                selectActivity(res.id); // Select new
            }
        } else alert(res.error || 'Failed');
    });

    deleteActivityBtn.addEventListener('click', async () => {
        const id = activityIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this activity? All attendance data will be lost.')) return;

        const res = await api('delete_activity', 'POST', { id });
        if (res.ok) {
            closeModal(activityModal);
            selectedActivity = null;
            activityTitle.textContent = 'Select Activity';
            editActivityBtn.style.display = 'none';
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            await loadState();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    // Modal Logic
    function openModal(modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        const input = modal.querySelector('input');
        if (input) input.focus();
    }

    function openCreateActivityModal() {
        activityIdInput.value = '';
        activityNameInput.value = '';
        activityDescriptionInput.value = '';
        activityDepartmentInput.value = 'Other';
        activitySessionsInput.value = '1';
        activityModalTitle.textContent = 'New Activity';
        saveActivityBtn.textContent = 'Create Activity';
        deleteActivityBtn.style.display = 'none';

        currentActivityStudentIds = [];
        renderStudentTags();

        openModal(activityModal);
    }

    function openEditActivityModal() {
        if (!selectedActivity) return;
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        activityIdInput.value = act.id;
        activityNameInput.value = act.name;
        activityDescriptionInput.value = act.description || '';
        activityDepartmentInput.value = act.department || 'Other';
        activitySessionsInput.value = act.sessions_per_week;
        activityModalTitle.textContent = 'Edit Activity';
        saveActivityBtn.textContent = 'Save Changes';
        deleteActivityBtn.style.display = 'block';

        currentActivityStudentIds = [...(act.student_ids || [])];
        renderStudentTags();

        openModal(activityModal);
    }

    function closeModal(modal) {
        // If no modal passed, close all active ones
        if (!modal) {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
            return;
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        const form = modal.querySelector('form');
        if (form) form.reset();
    }

    function openCreateStudentModal() {
        studentIdInput.value = '';
        firstNameInput.value = '';
        lastNameInput.value = '';
        studentYearGroup.value = '9';
        studentModalTitle.textContent = 'Add New Student';
        saveStudentBtn.textContent = 'Add Student';
        deleteStudentBtn.style.display = 'none';
        openModal(studentModal);
    }

    function openEditStudentModal(student) {
        studentIdInput.value = student.id;
        const parts = student.name.split(' ');
        firstNameInput.value = parts[0] || '';
        lastNameInput.value = parts.slice(1).join(' ') || '';
        studentYearGroup.value = student.year_group || '9';
        studentModalTitle.textContent = 'Edit Student';
        saveStudentBtn.textContent = 'Save Changes';
        deleteStudentBtn.style.display = 'block';
        openModal(studentModal);
    }

    assignStudentBtn.addEventListener('click', () => {
        if (!selectedActivity) return;
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        assignStudentIds = [...(act.student_ids || [])];
        renderAssignTags();
        openModal(assignStudentModal);
    });

    assignStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        const res = await api('update_activity', 'POST', {
            id: act.id,
            name: act.name,
            description: act.description || '',
            sessions_per_week: act.sessions_per_week,
            student_ids: assignStudentIds.join(',')
        });

        if (res.ok) {
            closeModal(assignStudentModal);
            await loadState();
            await loadAttendance(); // Refresh register
        } else {
            alert(res.error || 'Failed to update students');
        }
    });

    createStudentBtn.addEventListener('click', openCreateStudentModal);
    if (addActivityBtn) addActivityBtn.addEventListener('click', openCreateActivityModal);
    if (editActivityBtn) editActivityBtn.addEventListener('click', openEditActivityModal);

    closeModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        closeModal(modal);
    }));

    // Close on click outside
    [studentModal, activityModal, assignStudentModal, q('#studentStatsModal'), q('#activityStatsModal')].forEach(m => {
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) closeModal(m);
        });
    });

    // Close on Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // --- Student Stats Logic ---
    const studentStatsModal = q('#studentStatsModal');
    const studentStatsTitle = q('#studentStatsTitle');
    const studentTotalSessions = q('#studentTotalSessions');
    const studentTotalActivities = q('#studentTotalActivities');
    const studentActivityList = q('#studentActivityList');
    const studentHistoryList = q('#studentHistoryList');
    const downloadStudentCsvBtn = q('#downloadStudentCsvBtn');
    let currentStatsStudent = null;

    async function openStudentStats(student) {
        currentStatsStudent = student;
        studentStatsTitle.textContent = student.name;

        const res = await api('get_student_stats', 'GET', { id: student.id });
        if (res.error) return alert(res.error);
        const stats = res.stats;

        studentTotalSessions.textContent = stats.total;
        studentTotalActivities.textContent = Object.keys(stats.by_activity).length;

        // Activity List
        studentActivityList.innerHTML = '';
        Object.entries(stats.by_activity).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            studentActivityList.appendChild(div);
        });

        // History List
        studentHistoryList.innerHTML = '';
        stats.history.forEach(h => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.fontSize = '13px';
            div.innerHTML = `
            <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-size:11px; margin-bottom:2px;">
                <span>${h.week_start}</span>
                <span>Session ${h.session_index}</span>
            </div>
            <div>${h.activity_name}</div>
          `;
            studentHistoryList.appendChild(div);
        });

        openModal(studentStatsModal);
    }

    downloadStudentCsvBtn.addEventListener('click', async () => {
        if (!currentStatsStudent) return;
        const res = await api('get_student_stats', 'GET', { id: currentStatsStudent.id });
        const stats = res.stats;

        let csv = `Title,Value\n`;
        csv += `Student Name,"${currentStatsStudent.name}"\n`;
        
        // Activities Part Of
        const inActivities = state.activities.filter(a => (a.student_ids || []).includes(currentStatsStudent.id));
        const actNames = inActivities.map(a => a.name).join(', ');
        csv += `Activities Part Of,"${actNames}"\n`;
        
        csv += `Total Sessions,${stats.total}\n`;

        // Group history by week
        const weeklyData = {};
        stats.history.forEach(h => {
            if (!weeklyData[h.week_start]) weeklyData[h.week_start] = {};
            if (!weeklyData[h.week_start][h.activity_name]) weeklyData[h.week_start][h.activity_name] = 0;
            weeklyData[h.week_start][h.activity_name]++;
        });

        // Sort weeks
        const weeks = Object.keys(weeklyData).sort();
        
        weeks.forEach(w => {
            const activities = Object.entries(weeklyData[w])
                .map(([name, count]) => `${name} * ${count}`)
                .join(', ');
            csv += `W/C ${formatCsvDate(w)},"${activities}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentStatsStudent.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // --- Activity Stats Logic ---
    const activityStatsModal = q('#activityStatsModal');
    const activityStatsTitle = q('#activityStatsTitle');
    const activityTotalAttendance = q('#activityTotalAttendance');
    const activityStudentList = q('#activityStudentList');
    const downloadActivityCsvBtn = q('#downloadActivityCsvBtn');
    let currentStatsActivity = null;
    let activityTrendChartInstance = null;

    async function openActivityStats(activityId) {
        const act = state.activities.find(a => a.id == activityId);
        if (!act) return;
        currentStatsActivity = act;
        activityStatsTitle.textContent = act.name;

        const res = await api('get_activity_stats', 'GET', { id: act.id });
        if (res.error) return alert(res.error);
        const stats = res.stats;

        activityTotalAttendance.textContent = stats.total;

        // Student List
        activityStudentList.innerHTML = '';
        Object.entries(stats.by_student).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            activityStudentList.appendChild(div);
        });

        // Chart
        const ctx = q('#activityTrendChart').getContext('2d');
        if (activityTrendChartInstance) activityTrendChartInstance.destroy();

        activityTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: stats.weekly.map(x => x.week_start),
                datasets: [{
                    label: 'Attendance',
                    data: stats.weekly.map(x => x.count),
                    borderColor: '#34c759',
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } }
            }
        });

        openModal(activityStatsModal);
    }

    downloadActivityCsvBtn.addEventListener('click', async () => {
        if (!currentStatsActivity) return;
        const res = await api('get_activity_export', 'GET', { id: currentStatsActivity.id });
        if (res.error) return alert(res.error);
        
        const rawData = res.data;
        
        // 1. Get all unique weeks and sort them
        const weeksSet = new Set();
        rawData.forEach(r => weeksSet.add(r.week_start));
        const weeks = Array.from(weeksSet).sort();
        
        // 2. Map attendance data
        const attendanceMap = {};
        rawData.forEach(r => {
            if (!attendanceMap[r.student_name]) {
                attendanceMap[r.student_name] = {
                    weeks: {},
                    total: 0
                };
            }
            const count = parseInt(r.count);
            attendanceMap[r.student_name].weeks[r.week_start] = count;
            attendanceMap[r.student_name].total += count;
        });

        // 3. Build CSV
        let csv = 'Student Name,' + weeks.map(w => `W/C ${formatCsvDate(w)}`).join(',') + ',Total Sessions Attended\n';
        
        // Sort students by name
        const studentNames = Object.keys(attendanceMap).sort();
        
        studentNames.forEach(name => {
            const data = attendanceMap[name];
            const weekCols = weeks.map(w => data.weeks[w] || 0).join(',');
            csv += `"${name}",${weekCols},${data.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentStatsActivity.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // Update renderStatsTable to be clickable
    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.toLowerCase();

        state.students.forEach(s => {
            if (term && !s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.className = 'student-row';
            tr.onclick = () => openStudentStats(s);

            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    // Update renderCharts to be clickable
    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        const actIds = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
            actIds.push(a.id);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const activityId = actIds[index];
                        openActivityStats(activityId);
                    }
                }
            }
        });
    }

    studentForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = studentIdInput.value;
        const first = firstNameInput.value.trim();
        const last = lastNameInput.value.trim();
        const yearGroup = studentYearGroup.value;
        if (!first || !last) return;

        const fullName = `${first} ${last}`;

        let res;
        if (id) {
            res = await api('update_student', 'POST', { id, name: fullName, year_group: yearGroup });
        } else {
            res = await api('create_student', 'POST', { name: fullName, year_group: yearGroup });
        }

        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
            
            // If we are in settings view, refresh it
            if (settingsArea.style.display !== 'none') {
                renderSettings();
            }
        } else alert(res.error || 'Failed');
    });

    deleteStudentBtn.addEventListener('click', async () => {
        const id = studentIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this student? All their attendance data will be lost.')) return;

        const res = await api('delete_student', 'POST', { id });
        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    weekStartInput.addEventListener('change', async e => {
        // Native change event might trigger if flatpickr doesn't suppress it, 
        // but we handle it in flatpickr config below.
        // Keeping this for fallback if flatpickr fails to load.
        if (!weekStartInput._flatpickr) {
            selectedWeekStart = weekStartInput.value;
            await loadAttendance();
        }
    });

    // Initialize Flatpickr
    if (window.flatpickr) {
        flatpickr(weekStartInput, {
            dateFormat: "Y-m-d",
            defaultDate: isoMonday(),
            disableMobile: "true",
            plugins: [new weekSelect({})],
            locale: {
                firstDayOfWeek: 1 // Start week on Monday
            },
            altInput: true,
            altFormat: "\\W\\e\\e\\k \\o\\f F j, Y", // "Week of December 4, 2023"
            onChange: async function (selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    // The weekSelect plugin sets the date to the start of the week
                    const d = selectedDates[0];
                    // Ensure we have the ISO string for the API
                    // Adjust to local Monday to avoid timezone issues if necessary, 
                    // but flatpickr usually handles this well with the plugin.
                    // Let's use our isoMonday helper to be safe and consistent with the backend expectation.
                    const monday = isoMonday(d);

                    if (monday !== selectedWeekStart) {
                        selectedWeekStart = monday;
                        await loadAttendance();
                    }
                }
            }
        });
    }

    // keyboard navigation
    window.addEventListener('keydown', e => {
        const table = document.querySelector('.students-table');
        if (!table) return;
        // Only capture navigation keys if we aren't in an input or textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (['ArrowUp', 'ArrowDown', ' '].includes(e.key) || /^[1-7]$/.test(e.key)) {
            e.preventDefault();
        }
        if (e.key === 'ArrowUp') { focusedRow = Math.max(0, focusedRow - 1); renderRegister(); }
        if (e.key === 'ArrowDown') { focusedRow = Math.min(state.students.length - 1, focusedRow + 1); renderRegister(); }
        if (e.key === ' ') { // toggle session 1
            const s = state.students[focusedRow]; if (!s) return; const cb = document.querySelectorAll('.students-table tbody tr')[focusedRow].querySelector('input'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
        if (/^[1-7]$/.test(e.key)) {
            const si = parseInt(e.key, 10);
            const s = state.students[focusedRow]; if (!s) return; const row = document.querySelectorAll('.students-table tbody tr')[focusedRow]; const inputs = row.querySelectorAll('input'); if (si - 1 < inputs.length) { const cb = inputs[si - 1]; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
    });

    // CSV Upload Logic
    const uploadCsvLink = q('#uploadCsvLink');
    const csvUpload = q('#csvUpload');

    if (uploadCsvLink && csvUpload) {
        uploadCsvLink.addEventListener('click', (e) => {
            e.preventDefault();
            csvUpload.click();
        });

        csvUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const text = await file.text();
            const lines = text.split(/\r?\n/);
            let count = 0;

            for (const line of lines) {
                let trimmed = line.trim();
                if (!trimmed) continue;

                // Remove quotes
                trimmed = trimmed.replace(/['"]/g, '');
                
                const parts = trimmed.split(',').map(p => p.trim());
                let yearGroup = 9;
                let namePart = trimmed;

                // Check if last part is a year group
                if (parts.length > 1) {
                    const last = parts[parts.length - 1];
                    const match = last.match(/(\d+)/);
                    if (match) {
                        const val = parseInt(match[1]);
                        if (val >= 9 && val <= 13) {
                            yearGroup = val;
                            // Reconstruct name part from the rest
                            namePart = parts.slice(0, -1).join(',');
                        }
                    }
                }

                // Capitalize function
                const capitalize = (s) => {
                    if (!s) return '';
                    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
                };

                let firstName = '';
                let lastName = '';

                // Parse Name
                if (namePart.includes(',')) {
                    const nParts = namePart.split(',');
                    if (nParts.length >= 2) {
                        lastName = nParts[0].trim();
                        firstName = nParts[1].trim();
                    }
                } else {
                    const nParts = namePart.split(/\s+/);
                    if (nParts.length >= 2) {
                        lastName = nParts[0];
                        firstName = nParts.slice(1).join(' ');
                    }
                }

                if (!firstName || !lastName) continue;

                lastName = capitalize(lastName);
                firstName = firstName.split(/\s+/).map(p => capitalize(p)).join(' ');

                const fullName = `${firstName} ${lastName}`;

                const res = await api('create_student', 'POST', { name: fullName, year_group: yearGroup });
                if (res.ok) count++;
            }

            if (count > 0) {
                alert(`Successfully added ${count} students.`);
                closeModal(studentModal);
                await loadState();
                await loadAttendance();
            } else {
                alert('No valid students found in CSV.');
            }

            csvUpload.value = ''; // Reset
        });
    }

    // theme
    function loadTheme() {
        const root = document.documentElement;
        const t = localStorage.getItem('theme') || 'dark';
        if (t === 'light') root.classList.add('light'); else root.classList.remove('light');
    }
    toggleThemeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        root.classList.toggle('light');
        localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
    });

    // init
    (async function () {
        loadTheme();
        selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;
        await loadState();
    })();

})();
