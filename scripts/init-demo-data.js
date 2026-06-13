import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function initDemoDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => `https://sql.js.org/dist/${file}`
  })

  const db = new SQL.Database()

  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      floor TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 10,
      open_start_time TEXT NOT NULL DEFAULT '08:00',
      open_end_time TEXT NOT NULL DEFAULT '20:00',
      cost_per_hour REAL NOT NULL DEFAULT 0,
      cost_center_id TEXT,
      setup_buffer_minutes INTEGER NOT NULL DEFAULT 30,
      can_split INTEGER NOT NULL DEFAULT 0,
      split_from TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      room_id TEXT,
      status TEXT NOT NULL DEFAULT 'normal',
      maintenance_note TEXT,
      borrower_id TEXT,
      expected_return_date TEXT,
      last_maintenance_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE room_equipment (
      room_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      PRIMARY KEY (room_id, equipment_id)
    );

    CREATE TABLE cost_centers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      used REAL NOT NULL DEFAULT 0,
      department TEXT,
      manager_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE approval_rules (
      id TEXT PRIMARY KEY,
      meeting_level TEXT,
      has_visitor INTEGER,
      cost_center_id TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      requires_front_desk INTEGER NOT NULL DEFAULT 0,
      requires_security INTEGER NOT NULL DEFAULT 0,
      approver_id TEXT,
      min_attendees INTEGER,
      max_amount REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE recurring_rules (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      recurrence_type TEXT NOT NULL,
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      recurrence_days TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      booker_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      setup_start_time TEXT,
      teardown_end_time TEXT,
      attendee_count INTEGER NOT NULL DEFAULT 1,
      attendee_list TEXT,
      meeting_level TEXT NOT NULL DEFAULT 'normal',
      cost_center_id TEXT,
      has_visitors INTEGER NOT NULL DEFAULT 0,
      tea_break_needed INTEGER NOT NULL DEFAULT 0,
      tea_break_time TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      front_desk_confirmed INTEGER NOT NULL DEFAULT 0,
      security_approved INTEGER NOT NULL DEFAULT 0,
      check_in_time TEXT,
      released_at TEXT,
      swap_from_room_id TEXT,
      swap_reason TEXT,
      total_cost REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE booking_equipment (
      booking_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, equipment_id)
    );

    CREATE TABLE visitors (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      id_type TEXT,
      id_number TEXT,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      photo_url TEXT,
      id_verified INTEGER NOT NULL DEFAULT 0,
      security_approved INTEGER NOT NULL DEFAULT 0,
      check_in_time TEXT,
      check_out_time TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE booking_logs (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      detail TEXT,
      old_value TEXT,
      new_value TEXT
    );

    CREATE TABLE equipment_logs (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      detail TEXT,
      old_status TEXT,
      new_status TEXT
    );

    CREATE TABLE swap_history (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      from_room_id TEXT NOT NULL,
      to_room_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      reason TEXT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      booking_id TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const users = [
    ['user_admin', '张行政', 'admin', '行政部', 'admin@company.com', '13800000001'],
    ['user_emp1', '李员工', 'employee', '研发部', 'employee@company.com', '13800000002'],
    ['user_front', '王前台', 'frontdesk', '行政部', 'frontdesk@company.com', '13800000003'],
    ['user_equip', '赵设备', 'equipadmin', '运维部', 'equipadmin@company.com', '13800000004']
  ]

  users.forEach(user => {
    db.run('INSERT INTO users (id, name, role, department, email, phone) VALUES (?, ?, ?, ?, ?, ?)', user)
  })

  const costCenters = [
    ['cc_rd', '研发中心', 100000, 68000, '研发部', 'user_admin'],
    ['cc_mkt', '市场部', 50000, 32000, '市场部', 'user_admin'],
    ['cc_hr', '人力资源部', 30000, 15000, '人力资源部', 'user_admin'],
    ['cc_exec', '高管层', 200000, 85000, '高管层', 'user_admin']
  ]

  costCenters.forEach(cc => {
    db.run('INSERT INTO cost_centers (id, name, budget, used, department, manager_id) VALUES (?, ?, ?, ?, ?, ?)', cc)
  })

  const equipment = [
    ['eq_proj_1', '投影仪1', 'projector', 'room_101', 'normal', null, null, null, '2024-01-15'],
    ['eq_proj_2', '投影仪2', 'projector', 'room_102', 'normal', null, null, null, '2024-01-20'],
    ['eq_proj_3', '投影仪3', 'projector', 'room_201', 'normal', null, null, null, '2024-02-01'],
    ['eq_tv_1', '大屏电视', 'tv', 'room_101', 'normal', null, null, null, '2024-01-15'],
    ['eq_tv_2', '大屏电视', 'tv', 'room_201', 'maintenance', '灯泡更换', null, '2024-03-01', '2024-02-10'],
    ['eq_whiteboard_1', '电子白板', 'whiteboard', 'room_101', 'normal', null, null, null, '2024-01-15'],
    ['eq_whiteboard_2', '电子白板', 'whiteboard', 'room_301', 'normal', null, null, null, '2024-01-25'],
    ['eq_video_1', '视频会议系统', 'video_conference', 'room_101', 'normal', null, null, null, '2024-01-15'],
    ['eq_video_2', '视频会议系统', 'video_conference', 'room_201', 'faulty', '摄像头故障', null, null, '2024-02-15'],
    ['eq_mic_1', '无线麦克风', 'microphone', 'room_101', 'normal', null, null, null, '2024-01-15'],
    ['eq_mic_2', '无线麦克风', 'microphone', null, 'borrowed', null, 'user_emp1', '2024-03-10', '2024-02-20'],
    ['eq_laptop_1', '便携笔记本', 'laptop', null, 'normal', null, null, null, '2024-01-30']
  ]

  equipment.forEach(eq => {
    db.run('INSERT INTO equipment (id, name, type, room_id, status, maintenance_note, borrower_id, expected_return_date, last_maintenance_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', eq)
  })

  const rooms = [
    ['room_101', '创新会议室', '1F', 20, '08:00', '20:00', 200, 'cc_rd', 30, 0, null, 'active', '配备视频会议系统和电子白板'],
    ['room_102', '协作会议室', '1F', 10, '08:00', '20:00', 100, 'cc_mkt', 15, 0, null, 'active', '小型团队协作'],
    ['room_201', '高管会议厅', '2F', 50, '09:00', '18:00', 500, 'cc_exec', 60, 1, null, 'active', '可拆分为两个小会议室'],
    ['room_202', '培训教室', '2F', 30, '08:00', '21:00', 300, 'cc_hr', 30, 0, null, 'active', '配备投影和音响'],
    ['room_301', '面试间A', '3F', 6, '09:00', '18:00', 80, 'cc_hr', 10, 0, null, 'active', '小型面试'],
    ['room_302', '面试间B', '3F', 6, '09:00', '18:00', 80, 'cc_hr', 10, 0, null, 'active', '小型面试'],
    ['room_303', '研发讨论室', '3F', 8, '08:00', '22:00', 120, 'cc_rd', 15, 0, null, 'maintenance', '空调维修中'],
    ['room_401', '路演大厅', '4F', 100, '08:00', '22:00', 800, 'cc_mkt', 120, 1, null, 'active', '大型活动和路演']
  ]

  rooms.forEach(room => {
    db.run('INSERT INTO rooms (id, name, floor, capacity, open_start_time, open_end_time, cost_per_hour, cost_center_id, setup_buffer_minutes, can_split, split_from, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', room)
  })

  const roomEquipment = [
    ['room_101', 'eq_proj_1'],
    ['room_101', 'eq_tv_1'],
    ['room_101', 'eq_whiteboard_1'],
    ['room_101', 'eq_video_1'],
    ['room_101', 'eq_mic_1'],
    ['room_102', 'eq_proj_2'],
    ['room_201', 'eq_proj_3'],
    ['room_201', 'eq_tv_2'],
    ['room_201', 'eq_video_2'],
    ['room_301', 'eq_whiteboard_2']
  ]

  roomEquipment.forEach(re => {
    db.run('INSERT INTO room_equipment (room_id, equipment_id) VALUES (?, ?)', re)
  })

  const approvalRules = [
    ['rule_1', 'normal', 0, null, 0, 0, 0, null, null, null],
    ['rule_2', 'normal', 1, null, 0, 1, 0, 'user_front', null, null],
    ['rule_3', 'important', 0, null, 1, 0, 0, 'user_admin', null, 500],
    ['rule_4', 'important', 1, null, 1, 1, 1, 'user_admin', null, 500],
    ['rule_5', 'vip', null, null, 1, 1, 1, 'user_admin', 10, null]
  ]

  approvalRules.forEach(rule => {
    db.run('INSERT INTO approval_rules (id, meeting_level, has_visitor, cost_center_id, requires_approval, requires_front_desk, requires_security, approver_id, min_attendees, max_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', rule)
  })

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const formatDate = (d) => d.toISOString().split('T')[0]
  const formatDateTime = (d, hour, minute) => `${formatDate(d)}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`

  const bookings = [
    [
      'bk_001', 'room_101', 'user_emp1',
      '项目周例会',
      formatDateTime(today, 10, 0),
      formatDateTime(today, 11, 0),
      formatDateTime(today, 9, 30),
      formatDateTime(today, 11, 15),
      8, JSON.stringify(['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十']),
      'normal', 'cc_rd', 0, 0, null, 1, null,
      'confirmed', 1, 1, null, null, null, null, 200, '常规项目讨论'
    ],
    [
      'bk_002', 'room_201', 'user_admin',
      '季度高管会议',
      formatDateTime(today, 14, 0),
      formatDateTime(today, 17, 0),
      formatDateTime(today, 13, 0),
      formatDateTime(today, 17, 30),
      25, JSON.stringify(['CEO', 'CTO', 'CFO', 'COO', '各部门总监']),
      'vip', 'cc_exec', 0, 1, formatDateTime(today, 15, 30), 0, null,
      'pending', 0, 0, null, null, null, null, 1500, '需要准备会议材料'
    ],
    [
      'bk_003', 'room_102', 'user_emp1',
      '客户技术交流',
      formatDateTime(tomorrow, 9, 0),
      formatDateTime(tomorrow, 11, 30),
      formatDateTime(tomorrow, 8, 45),
      formatDateTime(tomorrow, 11, 45),
      6, JSON.stringify(['技术团队', '客户代表']),
      'important', 'cc_rd', 1, 1, formatDateTime(tomorrow, 10, 0), 0, null,
      'checking', 0, 0, null, null, null, null, 250, '有外部访客需要前台接待'
    ],
    [
      'bk_004', 'room_301', 'user_emp1',
      '候选人面试 - 技术岗',
      formatDateTime(tomorrow, 14, 0),
      formatDateTime(tomorrow, 15, 0),
      formatDateTime(tomorrow, 13, 50),
      formatDateTime(tomorrow, 15, 10),
      3, JSON.stringify(['面试官A', '面试官B', '候选人']),
      'normal', 'cc_hr', 1, 0, null, 0, null,
      'confirmed', 0, 0, null, null, null, null, 80, '候选人来自外部'
    ]
  ]

  bookings.forEach(bk => {
    db.run(`INSERT INTO bookings (
      id, room_id, booker_id, title, start_time, end_time,
      setup_start_time, teardown_end_time, attendee_count, attendee_list,
      meeting_level, cost_center_id, has_visitors, tea_break_needed, tea_break_time,
      is_recurring, recurring_parent_id, status, front_desk_confirmed, security_approved,
      check_in_time, released_at, swap_from_room_id, swap_reason, total_cost, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, bk)
  })

  const visitors = [
    ['v_001', 'bk_003', '陈客户', 'ABC科技公司', '身份证', '110101199001011234', '技术交流', 'pending', null, 0, 0, null, null],
    ['v_002', 'bk_004', '刘候选人', null, '身份证', '310101199505055678', '面试', 'pending', null, 0, 0, null, null]
  ]

  visitors.forEach(v => {
    db.run('INSERT INTO visitors (id, booking_id, name, company, id_type, id_number, purpose, status, photo_url, id_verified, security_approved, check_in_time, check_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', v)
  })

  const bookingLogs = [
    ['log_001', 'bk_001', 'create', 'user_emp1', formatDateTime(today, 9, 0), '创建预订', null, 'confirmed'],
    ['log_002', 'bk_001', 'approve', 'user_admin', formatDateTime(today, 9, 5), '审批通过', 'pending', 'approved'],
    ['log_003', 'bk_002', 'create', 'user_admin', formatDateTime(today, 10, 0), '创建VIP会议预订', null, 'pending'],
    ['log_004', 'bk_003', 'create', 'user_emp1', formatDateTime(today, 11, 0), '创建客户会议', null, 'checking']
  ]

  bookingLogs.forEach(log => {
    db.run('INSERT INTO booking_logs (id, booking_id, action, operator_id, timestamp, detail, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', log)
  })

  const equipmentLogs = [
    ['elog_001', 'eq_tv_2', 'maintenance', 'user_equip', formatDateTime(today, 8, 0), '灯泡更换', 'normal', 'maintenance'],
    ['elog_002', 'eq_video_2', 'fault', 'user_equip', formatDateTime(today, 9, 0), '摄像头故障报修', 'normal', 'faulty'],
    ['elog_003', 'eq_mic_2', 'borrow', 'user_emp1', formatDateTime(today, 10, 0), '借用无线麦克风', 'normal', 'borrowed']
  ]

  equipmentLogs.forEach(log => {
    db.run('INSERT INTO equipment_logs (id, equipment_id, action, operator_id, timestamp, detail, old_status, new_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', log)
  })

  const notifications = [
    ['notif_001', 'user_admin', 'booking_pending', '新的审批请求', '季度高管会议等待您的审批', 'bk_002', 0, formatDateTime(today, 10, 1)],
    ['notif_002', 'user_front', 'visitor_pending', '访客待确认', '客户技术交流会议有2位访客等待确认', 'bk_003', 0, formatDateTime(today, 11, 1)],
    ['notif_003', 'user_equip', 'equipment_fault', '设备故障', '视频会议系统2摄像头故障', null, 0, formatDateTime(today, 9, 1)]
  ]

  notifications.forEach(n => {
    db.run('INSERT INTO notifications (id, user_id, type, title, message, booking_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', n)
  })

  const data = db.export()
  const buffer = Buffer.from(data)
  const outputPath = path.join(__dirname, '../data/demo-database.db')
  
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  
  fs.writeFileSync(outputPath, buffer)
  console.log(`✅ 演示数据库已创建: ${outputPath}`)
  console.log(`📊 包含数据:`)
  console.log(`   - 用户: ${users.length} 个`)
  console.log(`   - 会议室: ${rooms.length} 间`)
  console.log(`   - 设备: ${equipment.length} 台`)
  console.log(`   - 成本中心: ${costCenters.length} 个`)
  console.log(`   - 预订: ${bookings.length} 个`)
  console.log(`   - 访客: ${visitors.length} 人`)
  console.log(`   - 审批规则: ${approvalRules.length} 条`)
  console.log(`   - 操作日志: ${bookingLogs.length + equipmentLogs.length} 条`)
  console.log(`   - 通知: ${notifications.length} 条`)

  db.close()
}

initDemoDatabase().catch(console.error)
