import initSqlJs, { type Database } from 'sql.js'
import { v4 as uuidv4 } from 'uuid'
import { format, addHours, addMinutes } from 'date-fns'

let db: Database | null = null

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function queryAll(sql: string, params?: any[]): any[] {
  const database = getDb()
  let stmt: any
  try {
    stmt = database.prepare(sql)
    if (params) stmt.bind(params)
    const results: any[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      results.push(row)
    }
    return results
  } finally {
    if (stmt) stmt.free()
  }
}

export function queryOne(sql: string, params?: any[]): any | null {
  const results = queryAll(sql, params)
  return results.length > 0 ? results[0] : null
}

export function run(sql: string, params?: any[]): void {
  const database = getDb()
  database.run(sql, params)
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs()
  db = new SQL.Database()

  db.run(`
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      floor TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      open_start_time TEXT NOT NULL,
      open_end_time TEXT NOT NULL,
      cost_per_hour REAL DEFAULT 0,
      cost_center_id TEXT,
      setup_buffer_minutes INTEGER DEFAULT 15,
      can_split INTEGER DEFAULT 0,
      split_from TEXT,
      status TEXT DEFAULT 'available',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE room_equipment (
      room_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      PRIMARY KEY (room_id, equipment_id)
    );
  `)

  db.run(`
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      booker_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      setup_start_time TEXT,
      teardown_end_time TEXT,
      attendee_count INTEGER NOT NULL,
      attendee_list TEXT,
      meeting_level TEXT DEFAULT 'normal',
      cost_center_id TEXT,
      has_visitors INTEGER DEFAULT 0,
      tea_break_needed INTEGER DEFAULT 0,
      tea_break_time TEXT,
      is_recurring INTEGER DEFAULT 0,
      recurring_parent_id TEXT,
      status TEXT DEFAULT 'pending',
      front_desk_confirmed INTEGER DEFAULT 0,
      security_approved INTEGER DEFAULT 0,
      check_in_time TEXT,
      released_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE booking_equipment (
      booking_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, equipment_id)
    );
  `)

  db.run(`
    CREATE TABLE visitors (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      id_type TEXT,
      id_number TEXT,
      purpose TEXT,
      status TEXT DEFAULT 'registered',
      photo_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      room_id TEXT,
      status TEXT DEFAULT 'normal',
      maintenance_note TEXT,
      expected_return_date TEXT,
      borrower_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE cost_centers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      used REAL NOT NULL DEFAULT 0,
      department TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE recurring_rules (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      frequency TEXT NOT NULL,
      day_of_week TEXT,
      day_of_month TEXT,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE booking_logs (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      detail TEXT
    );
  `)

  db.run(`
    CREATE TABLE equipment_logs (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      detail TEXT
    );
  `)

  db.run(`
    CREATE TABLE approval_rules (
      id TEXT PRIMARY KEY,
      meeting_level TEXT,
      has_visitor INTEGER,
      cost_center_id TEXT,
      requires_approval INTEGER DEFAULT 1,
      requires_front_desk INTEGER DEFAULT 0,
      requires_security INTEGER DEFAULT 0,
      approver_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE swap_history (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      from_room_id TEXT NOT NULL,
      to_room_id TEXT NOT NULL,
      reason TEXT,
      operator_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      no_show_count INTEGER DEFAULT 0
    );
  `)

  db.run(`CREATE INDEX idx_bookings_room_time ON bookings(room_id, start_time, end_time);`)
  db.run(`CREATE INDEX idx_bookings_status ON bookings(status);`)
  db.run(`CREATE INDEX idx_bookings_booker ON bookings(booker_id);`)
  db.run(`CREATE INDEX idx_bookings_recurring ON bookings(recurring_parent_id);`)
  db.run(`CREATE INDEX idx_visitors_booking ON visitors(booking_id);`)
  db.run(`CREATE INDEX idx_equipment_status ON equipment(status);`)
  db.run(`CREATE INDEX idx_booking_logs_booking ON booking_logs(booking_id);`)

  seedData()
}

function seedData(): void {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')

  const users = [
    { id: uuidv4(), name: '张管理', role: 'admin', department: '行政部' },
    { id: uuidv4(), name: '李员工', role: 'employee', department: '研发部' },
    { id: uuidv4(), name: '王前台', role: 'frontdesk', department: '行政部' },
    { id: uuidv4(), name: '赵设备', role: 'equipadmin', department: '行政部' },
  ]
  for (const u of users) {
    db!.run(`INSERT INTO users (id, name, role, department, no_show_count) VALUES (?, ?, ?, ?, 0)`, [u.id, u.name, u.role, u.department])
  }

  const costCenters = [
    { id: uuidv4(), name: '研发部', budget: 50000, used: 12000, department: '研发部' },
    { id: uuidv4(), name: '市场部', budget: 30000, used: 8000, department: '市场部' },
    { id: uuidv4(), name: '行政部', budget: 20000, used: 5000, department: '行政部' },
    { id: uuidv4(), name: '高管办', budget: 100000, used: 15000, department: '高管办' },
  ]
  for (const cc of costCenters) {
    db!.run(`INSERT INTO cost_centers (id, name, budget, used, department) VALUES (?, ?, ?, ?, ?)`, [cc.id, cc.name, cc.budget, cc.used, cc.department])
  }

  const equipmentList = [
    { id: uuidv4(), name: '高清投影仪-A', type: 'projector', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '高清投影仪-B', type: 'projector', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '电动幕布-1', type: 'screen', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '电动幕布-2', type: 'screen', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '视频会议终端', type: 'video_conferencing', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '电子白板-1', type: 'whiteboard', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '电子白板-2', type: 'whiteboard', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '音响系统-A', type: 'speaker', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '音响系统-B', type: 'speaker', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '无线麦克风套件', type: 'microphone', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '直播推流设备', type: 'livestream', roomId: null, status: 'normal' },
    { id: uuidv4(), name: '触控一体机', type: 'touchscreen', roomId: null, status: 'normal' },
  ]
  for (const eq of equipmentList) {
    db!.run(`INSERT INTO equipment (id, name, type, room_id, status) VALUES (?, ?, ?, ?, ?)`, [eq.id, eq.name, eq.type, eq.roomId, eq.status])
  }

  const rooms = [
    { id: uuidv4(), name: 'A1-大会议室', floor: 'A', capacity: 30, openStart: '08:00', openEnd: '20:00', costPerHour: 200, costCenterId: costCenters[2].id, buffer: 15, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'A2-中会议室', floor: 'A', capacity: 15, openStart: '08:00', openEnd: '20:00', costPerHour: 100, costCenterId: costCenters[2].id, buffer: 10, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'A3-小会议室', floor: 'A', capacity: 8, openStart: '08:00', openEnd: '20:00', costPerHour: 50, costCenterId: costCenters[2].id, buffer: 5, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'B1-董事厅', floor: 'B', capacity: 20, openStart: '09:00', openEnd: '18:00', costPerHour: 300, costCenterId: costCenters[3].id, buffer: 20, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'B2-培训室', floor: 'B', capacity: 40, openStart: '08:00', openEnd: '21:00', costPerHour: 150, costCenterId: costCenters[2].id, buffer: 15, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'B3-视频会议室', floor: 'B', capacity: 12, openStart: '08:00', openEnd: '20:00', costPerHour: 120, costCenterId: costCenters[2].id, buffer: 10, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'C1-洽谈室', floor: 'C', capacity: 6, openStart: '09:00', openEnd: '18:00', costPerHour: 30, costCenterId: costCenters[2].id, buffer: 0, canSplit: false, splitFrom: null, status: 'available' },
    { id: uuidv4(), name: 'C2-灵活空间', floor: 'C', capacity: 50, openStart: '08:00', openEnd: '22:00', costPerHour: 250, costCenterId: costCenters[2].id, buffer: 20, canSplit: true, splitFrom: null, status: 'available' },
  ]
  for (const r of rooms) {
    db!.run(
      `INSERT INTO rooms (id, name, floor, capacity, open_start_time, open_end_time, cost_per_hour, cost_center_id, setup_buffer_minutes, can_split, split_from, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.floor, r.capacity, r.openStart, r.openEnd, r.costPerHour, r.costCenterId, r.buffer, r.canSplit ? 1 : 0, r.splitFrom, r.status]
    )
  }

  const roomEquipmentMap: Record<string, string[]> = {
    [rooms[0].id]: ['projector', 'screen', 'speaker', 'microphone'],
    [rooms[1].id]: ['projector', 'screen', 'whiteboard'],
    [rooms[2].id]: ['whiteboard'],
    [rooms[3].id]: ['projector', 'screen', 'speaker', 'microphone', 'touchscreen'],
    [rooms[4].id]: ['projector', 'screen', 'speaker', 'microphone', 'whiteboard', 'livestream'],
    [rooms[5].id]: ['video_conferencing', 'screen', 'microphone', 'speaker'],
    [rooms[6].id]: ['whiteboard'],
    [rooms[7].id]: ['projector', 'screen', 'speaker', 'microphone', 'whiteboard'],
  }
  for (const [roomId, types] of Object.entries(roomEquipmentMap)) {
    for (const type of types) {
      const eq = equipmentList.find(e => e.type === type && !e.roomId)
      if (eq) {
        db!.run(`INSERT INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [roomId, eq.id])
        db!.run(`UPDATE equipment SET room_id = ? WHERE id = ?`, [roomId, eq.id])
        eq.roomId = roomId
      }
    }
  }

  const approvalRules = [
    { id: uuidv4(), meetingLevel: 'normal', hasVisitor: 0, requiresApproval: 0, requiresFrontDesk: 0, requiresSecurity: 0, approverId: null },
    { id: uuidv4(), meetingLevel: 'important', hasVisitor: null, requiresApproval: 1, requiresFrontDesk: 0, requiresSecurity: 0, approverId: users[0].id },
    { id: uuidv4(), meetingLevel: 'vip', hasVisitor: 0, requiresApproval: 1, requiresFrontDesk: 1, requiresSecurity: 1, approverId: users[0].id },
    { id: uuidv4(), meetingLevel: null, hasVisitor: 1, requiresApproval: 0, requiresFrontDesk: 1, requiresSecurity: 0, approverId: users[2].id },
    { id: uuidv4(), meetingLevel: 'vip', hasVisitor: 1, requiresApproval: 1, requiresFrontDesk: 1, requiresSecurity: 1, approverId: users[0].id },
  ]
  for (const rule of approvalRules) {
    db!.run(
      `INSERT INTO approval_rules (id, meeting_level, has_visitor, requires_approval, requires_front_desk, requires_security, approver_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rule.id, rule.meetingLevel, rule.hasVisitor, rule.requiresApproval, rule.requiresFrontDesk, rule.requiresSecurity, rule.approverId]
    )
  }

  const bookings = [
    {
      id: uuidv4(), roomId: rooms[0].id, bookerId: users[1].id, title: '项目周会',
      startTime: `${today}T09:00:00`, endTime: `${today}T10:00:00`,
      setupStartTime: `${today}T08:45:00`, teardownEndTime: `${today}T10:15:00`,
      attendeeCount: 15, meetingLevel: 'normal', costCenterId: costCenters[0].id,
      hasVisitors: 0, teaBreakNeeded: 0, isRecurring: 1, recurringParentId: null,
      status: 'confirmed', frontDeskConfirmed: 0, securityApproved: 0,
    },
    {
      id: uuidv4(), roomId: rooms[3].id, bookerId: users[0].id, title: '董事会议',
      startTime: `${today}T14:00:00`, endTime: `${today}T16:00:00`,
      setupStartTime: `${today}T13:40:00`, teardownEndTime: `${today}T16:20:00`,
      attendeeCount: 12, meetingLevel: 'vip', costCenterId: costCenters[3].id,
      hasVisitors: 0, teaBreakNeeded: 1, isRecurring: 0, recurringParentId: null,
      status: 'approved', frontDeskConfirmed: 1, securityApproved: 1,
    },
    {
      id: uuidv4(), roomId: rooms[5].id, bookerId: users[1].id, title: '远程协作会议',
      startTime: `${today}T10:30:00`, endTime: `${today}T11:30:00`,
      setupStartTime: `${today}T10:20:00`, teardownEndTime: `${today}T11:40:00`,
      attendeeCount: 8, meetingLevel: 'normal', costCenterId: costCenters[0].id,
      hasVisitors: 0, teaBreakNeeded: 0, isRecurring: 0, recurringParentId: null,
      status: 'confirmed', frontDeskConfirmed: 0, securityApproved: 0,
    },
    {
      id: uuidv4(), roomId: rooms[1].id, bookerId: users[1].id, title: '客户方案讨论',
      startTime: `${today}T13:00:00`, endTime: `${today}T14:00:00`,
      setupStartTime: `${today}T12:50:00`, teardownEndTime: `${today}T14:10:00`,
      attendeeCount: 10, meetingLevel: 'important', costCenterId: costCenters[1].id,
      hasVisitors: 1, teaBreakNeeded: 1, isRecurring: 0, recurringParentId: null,
      status: 'confirmed', frontDeskConfirmed: 1, securityApproved: 0,
    },
  ]
  for (const b of bookings) {
    db!.run(
      `INSERT INTO bookings (id, room_id, booker_id, title, start_time, end_time, setup_start_time, teardown_end_time, attendee_count, meeting_level, cost_center_id, has_visitors, tea_break_needed, is_recurring, recurring_parent_id, status, front_desk_confirmed, security_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.id, b.roomId, b.bookerId, b.title, b.startTime, b.endTime, b.setupStartTime, b.teardownEndTime, b.attendeeCount, b.meetingLevel, b.costCenterId, b.hasVisitors, b.teaBreakNeeded, b.isRecurring, b.recurringParentId, b.status, b.frontDeskConfirmed, b.securityApproved]
    )
    db!.run(
      `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), b.id, 'created', b.bookerId, '创建预订']
    )
  }

  if (bookings[0].isRecurring) {
    db!.run(
      `INSERT INTO recurring_rules (id, booking_id, frequency, day_of_week, end_date) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), bookings[0].id, 'weekly', '1', format(addMonths(now, 3), 'yyyy-MM-dd')]
    )
  }

  const visitorData = [
    { id: uuidv4(), bookingId: bookings[3].id, name: '陈客户', company: '合作科技公司', idType: '身份证', idNumber: '110101199001011234', purpose: '方案讨论', status: 'registered' },
    { id: uuidv4(), bookingId: bookings[3].id, name: '刘伙伴', company: '合作科技公司', idType: '护照', idNumber: 'E12345678', purpose: '方案讨论', status: 'id_verified' },
  ]
  for (const v of visitorData) {
    db!.run(
      `INSERT INTO visitors (id, booking_id, name, company, id_type, id_number, purpose, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.id, v.bookingId, v.name, v.company, v.idType, v.idNumber, v.purpose, v.status]
    )
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
