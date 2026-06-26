import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Monitor,
  BarChart3,
  FileText,
  MapPin,
  Wifi,
  Database,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Loader,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
  WifiOff,
  RefreshCw as RefreshCwAlt,
  Eye,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import type {
  Machine,
  MachineEmployeesResponse,
  RawScanLogsResponse,
  RawScanLog,
  MachineDbMappedUser,
  MachineUnmappedUser,
  MachineRawUser,
} from '../../../../types';
import {
  getMachineEmployees,
  getMachineRawScanLogs,
  getMachineUserAttendance,
} from '../../../../lib/api';

interface MachineDetailModalProps {
  machine: Machine | null;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'metadata' | 'summary' | 'records';
type RecordsSubTab = 'users' | 'logs';
type DataMode = 'mesin' | 'database';

// User detail state
interface SelectedUser {
  raw_id: string;
  parsed_employee_code?: string;
  employee_name?: string | null;
  zkteco_user_name?: string | null;
  mapping_status?: string;
  mapping_reason?: string | null;
  machine_code: string;
  mode: DataMode;
}

export function MachineDetailModal({ machine, isOpen, onClose }: MachineDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('metadata');
  const [recordsSubTab, setRecordsSubTab] = useState<RecordsSubTab>('users');
  const [dataMode, setDataMode] = useState<DataMode>('database');
  const [userPage, setUserPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);

  const pageSize = 10;

  // Fetch machine employees data
  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
    refetch: refetchEmployees,
  } = useQuery<MachineEmployeesResponse>({
    queryKey: ['machine-employees', machine?.machine_code],
    queryFn: () => getMachineEmployees(machine!.machine_code),
    enabled: !!machine && isOpen,
  });

  // Fetch user attendance when a user is selected
  const {
    data: userAttendance,
    isLoading: attendanceLoading,
    refetch: refetchAttendance,
  } = useQuery({
    queryKey: ['user-attendance', selectedUser?.raw_id, selectedUser?.machine_code],
    queryFn: async () => {
      if (!selectedUser) return null;
      // Get attendance history for this user from this machine
      const data = await getMachineUserAttendance(
        selectedUser.machine_code,
        selectedUser.raw_id,
        { limit: 60 }
      );
      return data;
    },
    enabled: !!selectedUser && !!machine,
  });

  // Fetch raw scan logs
  const {
    data: logsData,
    isLoading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useQuery<RawScanLogsResponse>({
    queryKey: ['machine-raw-logs', machine?.machine_code, logPage],
    queryFn: () =>
      getMachineRawScanLogs(machine!.machine_code, {
        page: logPage,
        limit: pageSize,
      }),
    enabled: !!machine && isOpen && activeTab === 'records',
  });

  if (!isOpen || !machine) return null;

  const getStatusClass = () => {
    const access = (machine.access_status ?? '').toUpperCase();
    if (access === 'PORT_BLOCKED') return 'blocked';
    if (access === 'NETWORK_UNREACHABLE') return 'unreachable';
    if (!machine.is_active) return 'disabled';
    if (access === 'ACCESSIBLE') {
      if (machine.last_sync_at) {
        const ageMs = Date.now() - new Date(machine.last_sync_at).getTime();
        if (ageMs > 60 * 60 * 1000) return 'stale';
      }
      const quality = (machine as any).quality_score ?? 100;
      if (quality < 80) return 'warning';
      return 'online';
    }
    return 'offline';
  };

  const getStatusLabel = () => {
    const access = (machine.access_status ?? '').toUpperCase();
    if (access === 'PORT_BLOCKED') return 'Blocked';
    if (access === 'NETWORK_UNREACHABLE') return 'Unreachable';
    if (!machine.is_active) return 'Disabled';
    if (access === 'ACCESSIBLE') {
      if (machine.last_sync_at) {
        const ageMs = Date.now() - new Date(machine.last_sync_at).getTime();
        if (ageMs > 60 * 60 * 1000) return 'Stale';
      }
      return 'Online';
    }
    if (access === 'TIMEOUT') return 'Warning';
    return 'Offline';
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Filter users by search - Mode specific
  const filteredMappedUsers = (employeesData?.database_mapped ?? []).filter(
    (u) =>
      u.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.parsed_employee_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.raw_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUnmappedUsers = (employeesData?.unmapped ?? []).filter(
    (u) =>
      u.raw_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.zkteco_user_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Machine raw users (for Data Mesin mode)
  const filteredRawUsers = (employeesData?.machine_raw ?? []).filter(
    (u) =>
      u.raw_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.zkteco_user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.parsed_employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals based on mode
  const getUsersForMode = () => {
    if (dataMode === 'mesin') {
      return filteredRawUsers;
    }
    // Database mode: show mapped + unmapped combined
    return [...filteredMappedUsers, ...filteredUnmappedUsers];
  };

  const totalUsers = getUsersForMode().length || 1;
  const totalUserPages = Math.ceil(totalUsers / pageSize);
  const paginatedUsers = getUsersForMode().slice(
    (userPage - 1) * pageSize,
    userPage * pageSize
  );

  // Filter logs by search
  const filteredLogs = (logsData?.records ?? []).filter(
    (log) =>
      log.raw_device_user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.raw_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.parsed_employee_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.zkteco_user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.employee_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Overlay */}
      <div className="detail-overlay" onClick={onClose} />

      {/* Panel */}
      <aside className="detail-panel">
        {/* Header */}
        <header className="detail-header">
          <div className="detail-header-left">
            <h2>{machine.machine_name}</h2>
            <span className={`status-badge-organic ${getStatusClass()}`}>
              <span className="status-dot-animated" />
              {getStatusLabel()}
            </span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {/* Tabs */}
        <nav className="detail-tabs">
          <button
            className={`tab-btn ${activeTab === 'metadata' ? 'active' : ''}`}
            onClick={() => setActiveTab('metadata')}
          >
            <Monitor size={18} />
            Metadata
          </button>
          <button
            className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <BarChart3 size={18} />
            Summary
          </button>
          <button
            className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => setActiveTab('records')}
          >
            <FileText size={18} />
            Records
          </button>
        </nav>

        {/* Content */}
        <div className="detail-content">
          {/* Metadata Tab */}
          {activeTab === 'metadata' && (
            <div className="tab-panel active">
              <div className="detail-section">
                <h3 className="detail-section-title">
                  <Monitor size={20} />
                  Machine Information
                </h3>
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">Machine Code</div>
                    <div className="info-value">{machine.machine_code}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Machine Name</div>
                    <div className="info-value">{machine.machine_name}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Machine Type</div>
                    <div className="info-value">ZKTeco Biometric</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Data Source</div>
                    <div className="info-value">{machine.data_source}</div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3 className="detail-section-title">
                  <Wifi size={20} />
                  Connection Details
                </h3>
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">IP Address</div>
                    <div className="info-value mono">{machine.ip_address}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Port</div>
                    <div className="info-value mono">{machine.port}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Location</div>
                    <div className="info-value">{machine.location_name}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Status</div>
                    <div className="info-value">
                      {machine.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3 className="detail-section-title">
                  <AlertCircle size={20} />
                  Status Classification
                </h3>
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">Access Status</div>
                    <div className={`info-value ${machine.access_status === 'ACCESSIBLE' ? 'text-success' : machine.access_status === 'PORT_BLOCKED' ? 'text-error' : machine.access_status === 'NETWORK_UNREACHABLE' ? 'text-error' : 'text-warning'}`}>
                      {(machine.access_status ?? 'UNKNOWN').replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Display Status</div>
                    <div className={`info-value ${getStatusClass() === 'online' ? 'text-success' : getStatusClass() === 'stale' ? 'text-warning' : getStatusClass() === 'blocked' || getStatusClass() === 'unreachable' ? 'text-error' : 'text-muted'}`}>
                      {getStatusLabel()}
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Sync Status</div>
                    <div className={`info-value ${(machine.sync_status ?? '').toUpperCase() === 'STALE' ? 'text-warning' : 'text-success'}`}>
                      {(machine.sync_status ?? 'UNKNOWN').replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Severity</div>
                    <div className={`info-value ${(machine.severity ?? '').toUpperCase() === 'CRITICAL' ? 'text-error' : (machine.severity ?? '').toUpperCase() === 'HIGH' ? 'text-warning' : 'text-muted'}`}>
                      {(machine.severity ?? 'UNKNOWN').replace(/_/g, ' ')}
                    </div>
                  </div>
                  {(machine.reason) && (
                    <div className="info-card full-width">
                      <div className="info-label">Reason</div>
                      <div className="info-value text-muted">{machine.reason}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h3 className="detail-section-title">
                  <Database size={20} />
                  Statistics
                </h3>
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">Total Users</div>
                    <div className="info-value">{machine.user_count}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Scan 1 Hour</div>
                    <div className="info-value">{machine.scan_count_1h}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="tab-panel active">
              {employeesLoading ? (
                <div className="loading-state">
                  <Loader size={24} className="animate-spin" />
                  <span>Loading employee data...</span>
                </div>
              ) : employeesError ? (
                <div className="error-state">
                  <AlertCircle size={24} />
                  <span>Failed to load data</span>
                  <button className="btn-organic btn-organic-secondary" onClick={() => refetchEmployees()}>
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              ) : employeesData ? (
                <>
                  <div className="detail-section">
                    <h3 className="detail-section-title">
                      <Users size={20} />
                      User Mapping Summary
                    </h3>
                    <div className="stats-grid">
                      <div className="stat-card-organic">
                        <div className="icon-wrap blue">
                          <Users size={24} />
                        </div>
                        <div className="value">{employeesData.summary.total_unique_ids}</div>
                        <div className="label">Total Raw IDs</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap green">
                          <CheckCircle size={24} />
                        </div>
                        <div className="value">{employeesData.summary.mapped_count}</div>
                        <div className="label">Mapped</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap red">
                          <XCircle size={24} />
                        </div>
                        <div className="value">{employeesData.summary.unmapped_count}</div>
                        <div className="label">Unmapped</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap green">
                          <Users size={24} />
                        </div>
                        <div className="value">{employeesData.summary.db_employees_seen}</div>
                        <div className="label">DB Employees</div>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h3 className="detail-section-title">
                      <TrendingUp size={20} />
                      Machine Performance
                    </h3>
                    <div className="stats-grid">
                      <div className="stat-card-organic">
                        <div className="icon-wrap yellow">
                          <Clock size={24} />
                        </div>
                        <div className="value">{formatTimeAgo(machine.last_sync_at)}</div>
                        <div className="label">Last Sync</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap green">
                          <TrendingUp size={24} />
                        </div>
                        <div className="value">{machine.scan_count_1h}</div>
                        <div className="label">Scans / Hour</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap blue">
                          <Users size={24} />
                        </div>
                        <div className="value">{machine.user_count}</div>
                        <div className="label">Active Users</div>
                      </div>
                      <div className="stat-card-organic">
                        <div className="icon-wrap green">
                          <CheckCircle size={24} />
                        </div>
                        <div className="value">
                          {employeesData.summary.total_unique_ids > 0
                            ? Math.round(
                                (employeesData.summary.mapped_count /
                                  employeesData.summary.total_unique_ids) *
                                  100
                              )
                            : 0}
                          %
                        </div>
                        <div className="label">Mapping Rate</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Records Tab */}
          {activeTab === 'records' && (
            <div className="tab-panel active">
              {/* Mode Toggle - Data Mesin vs Database */}
              <div className="data-mode-toggle">
                <button
                  className={`mode-btn ${dataMode === 'mesin' ? 'active mesin' : ''}`}
                  onClick={() => {
                    setDataMode('mesin');
                    setSearchQuery('');
                    setUserPage(1);
                  }}
                >
                  <Monitor size={16} />
                  Data Mesin
                </button>
                <button
                  className={`mode-btn ${dataMode === 'database' ? 'active database' : ''}`}
                  onClick={() => {
                    setDataMode('database');
                    setSearchQuery('');
                    setUserPage(1);
                  }}
                >
                  <Database size={16} />
                  Database
                </button>
              </div>

              {/* Sub-tabs */}
              <div className="records-subtabs">
                <button
                  className={`subtab-btn ${recordsSubTab === 'users' ? 'active' : ''}`}
                  onClick={() => {
                    setRecordsSubTab('users');
                    setSearchQuery('');
                    setUserPage(1);
                  }}
                >
                  <Users size={16} />
                  User List ({employeesData?.summary.total_unique_ids ?? 0})
                </button>
                <button
                  className={`subtab-btn ${recordsSubTab === 'logs' ? 'active' : ''}`}
                  onClick={() => {
                    setRecordsSubTab('logs');
                    setSearchQuery('');
                    setLogPage(1);
                  }}
                >
                  <FileText size={16} />
                  Scan Logs ({logsData?.pagination.total ?? 0})
                </button>
              </div>

              {/* Search */}
              <div className="records-search">
                <div className="search-input-wrap">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder={
                      recordsSubTab === 'users'
                        ? dataMode === 'mesin'
                          ? 'Search by raw ID or machine name...'
                          : 'Search by name or employee code...'
                        : 'Search by device ID or employee...'
                    }
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setUserPage(1);
                      setLogPage(1);
                    }}
                  />
                </div>
                <button
                  className="btn-organic btn-organic-secondary"
                  onClick={() => {
                    if (recordsSubTab === 'users') refetchEmployees();
                    else refetchLogs();
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Users Sub-tab */}
              {recordsSubTab === 'users' && (
                <>
                  {employeesLoading ? (
                    <div className="loading-state">
                      <Loader size={24} className="animate-spin" />
                      <span>Loading users...</span>
                    </div>
                  ) : employeesError ? (
                    <div className="error-state">
                      <AlertCircle size={24} />
                      <span>Failed to load users</span>
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="table-data">
                        <thead>
                          <tr>
                            {dataMode === 'mesin' ? (
                              <>
                                <th>Raw Absensi ID</th>
                                <th>Nama Mesin</th>
                                <th>Employee Code</th>
                                <th>Status</th>
                                <th>Scans</th>
                                <th>Last Seen</th>
                              </>
                            ) : (
                              <>
                                <th>Employee</th>
                                <th>Device UID</th>
                                <th>Status</th>
                                <th>Scans</th>
                                <th>Last Seen</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Mode: Data Mesin - raw machine identity stays primary. */}
                          {dataMode === 'mesin' ? (
                            (paginatedUsers as MachineRawUser[]).map((user, index) => {
                              const machineName = user.zkteco_user_name || user.employee_name || null;
                              return (
                                <tr
                                  key={`raw-${user.raw_id}-${index}`}
                                  className="clickable-row"
                                  onClick={() => setSelectedUser({
                                    raw_id: user.raw_id,
                                    parsed_employee_code: user.parsed_employee_code,
                                    employee_name: user.employee_name,
                                    zkteco_user_name: user.zkteco_user_name,
                                    mapping_status: user.mapping_status,
                                    mapping_reason: user.mapping_reason,
                                    machine_code: machine!.machine_code,
                                    mode: 'mesin'
                                  })}
                                >
                                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                                    <div className="user-cell">
                                      <div className="user-avatar raw">
                                        <Monitor size={14} />
                                      </div>
                                      <span className="device-uid">{user.raw_id}</span>
                                      {user.raw_id_length && (
                                        <span className="raw-id-length">({user.raw_id_length}d)</span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <span className={machineName ? 'machine-name' : 'text-muted'}>
                                      {machineName || 'Tidak ditemukan di user mesin'}
                                    </span>
                                  </td>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                    {user.parsed_employee_code || '-'}
                                  </td>
                                  <td>
                                    <span className={`badge-organic ${
                                      user.mapping_status === 'MAPPED' ? 'mapped' :
                                      user.mapping_status === 'NEED_REVIEW' ? 'unmapped' : 'unmapped'
                                    }`}>
                                      {user.mapping_status || 'Unknown'}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="scan-count">{user.occurrence_count}</span>
                                  </td>
                                  <td>
                                    <span className="last-seen">{formatTimeAgo(user.last_seen)}</span>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <>
                              {/* Database Mode - Mapped Users */}
                              {(paginatedUsers as MachineDbMappedUser[])
                                .filter(u => u.employee_name) // Only show mapped users first
                                .map((user: MachineDbMappedUser) => (
                                  <tr
                                    key={`mapped-${user.raw_id}`}
                                    className="clickable-row"
                                    onClick={() => setSelectedUser({
                                      raw_id: user.raw_id,
                                      parsed_employee_code: user.parsed_employee_code,
                                      employee_name: user.employee_name,
                                      mapping_status: 'MAPPED',
                                      machine_code: machine!.machine_code,
                                      mode: 'database'
                                    })}
                                  >
                                    <td>
                                      <div className="user-cell">
                                        <div className="user-avatar">{getInitials(user.employee_name)}</div>
                                        <div>
                                          <div className="user-name">{user.employee_name}</div>
                                          <div className="user-code">{user.parsed_employee_code}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)' }}>{user.raw_id}</td>
                                    <td>
                                      <span className="badge-organic mapped">
                                        <CheckCircle size={12} />
                                        Mapped
                                      </span>
                                    </td>
                                    <td>{user.occurrence_count}</td>
                                    <td>{formatTimeAgo(user.last_seen)}</td>
                                  </tr>
                                ))}
                              {/* Database Mode - Unmapped Users */}
                              {(paginatedUsers as MachineUnmappedUser[])
                                .filter(u => !u.employee_name && u.raw_id) // Unmapped users
                                .map((user: MachineUnmappedUser) => (
                                  <tr
                                    key={`unmapped-${user.raw_id}`}
                                    className="clickable-row"
                                    onClick={() => setSelectedUser({
                                      raw_id: user.raw_id,
                                      parsed_employee_code: undefined,
                                      employee_name: null,
                                      zkteco_user_name: user.zkteco_user_name,
                                      mapping_status: user.mapping_status,
                                      mapping_reason: user.mapping_reason,
                                      machine_code: machine!.machine_code,
                                      mode: 'database'
                                    })}
                                  >
                                    <td>
                                      <div className="user-cell">
                                        <div className="user-avatar unmapped">
                                          <Users size={14} />
                                        </div>
                                        <div>
                                          <div className="user-name text-muted">{user.zkteco_user_name || 'Unmapped'}</div>
                                          <div className="user-code">{user.raw_id}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)' }}>{user.raw_id}</td>
                                    <td>
                                      <span className="badge-organic unmapped">
                                        <AlertCircle size={12} />
                                        {user.mapping_status || 'Unmapped'}
                                      </span>
                                    </td>
                                    <td>{user.occurrence_count ?? '-'}</td>
                                    <td>{formatTimeAgo(user.last_seen)}</td>
                                  </tr>
                                ))}
                            </>
                          )}
                        </tbody>
                      </table>
                      {totalUsers === 0 && (
                        <div className="empty-state-inline">
                          <div className="empty-state-content">
                            {dataMode === 'mesin' ? (
                              <>
                                <Monitor size={48} className="empty-icon" />
                                <p>No raw data from machine</p>
                                <span className="empty-hint">Data will appear when machine syncs</span>
                              </>
                            ) : (
                              <>
                                <Users size={48} className="empty-icon" />
                                <p>No mapped employees</p>
                                <span className="empty-hint">Map device UIDs to employees</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="pagination">
                        <span className="pagination-info">
                          Showing {Math.min((userPage - 1) * pageSize + 1, totalUsers)}-
                          {Math.min(userPage * pageSize, totalUsers)} of {totalUsers}
                          {dataMode === 'mesin' && employeesData && (
                            <span className="mode-indicator mesin"> • Data Mesin</span>
                          )}
                          {dataMode === 'database' && employeesData && (
                            <span className="mode-indicator database"> • Database</span>
                          )}
                        </span>
                        <div className="pagination-controls">
                          <button
                            className="page-btn"
                            onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                            disabled={userPage === 1}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          {Array.from({ length: Math.min(totalUserPages, 5) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                              <button
                                key={pageNum}
                                className={`page-btn ${userPage === pageNum ? 'active' : ''}`}
                                onClick={() => setUserPage(pageNum)}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            className="page-btn"
                            onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                            disabled={userPage === totalUserPages}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Logs Sub-tab */}
              {recordsSubTab === 'logs' && (
                <>
                  {logsLoading ? (
                    <div className="loading-state">
                      <Loader size={24} className="animate-spin" />
                      <span>Loading scan logs...</span>
                    </div>
                  ) : logsError ? (
                    <div className="error-state">
                      <AlertCircle size={24} />
                      <span>Failed to load logs</span>
                    </div>
                  ) : logsData ? (
                    <div className="table-container">
                      <table className="table-data">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Name</th>
                            <th>Raw Absensi ID</th>
                            <th>Type</th>
                            <th>Verify</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((log: RawScanLog) => (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {new Date(log.scan_time).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td>
                                {log.employee_name || log.zkteco_user_name ? (
                                  <div className="user-cell">
                                    <div className="user-avatar">{getInitials(log.employee_name || log.zkteco_user_name || '-')}</div>
                                    <div>
                                      <div className="user-name">{log.employee_name || log.zkteco_user_name}</div>
                                      <div className="user-code">{log.parsed_employee_code || log.raw_device_user_id || log.raw_id}</div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                {log.raw_device_user_id}
                              </td>
                              <td>{log.event_type || '-'}</td>
                              <td>{log.verify_type || '-'}</td>
                              <td>
                                <span
                                  className={`badge-organic ${
                                    log.mapping_status === 'MAPPED' ? 'mapped' : 'unmapped'
                                  }`}
                                >
                                  {log.mapping_status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredLogs.length === 0 && (
                        <div className="empty-state-inline">
                          No scan logs found
                        </div>
                      )}
                      <div className="pagination">
                        <span className="pagination-info">
                          Page {logsData.pagination.page} of {logsData.pagination.totalPages} ({logsData.pagination.total} records)
                        </span>
                        <div className="pagination-controls">
                          <button
                            className="page-btn"
                            onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                            disabled={logPage === 1}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button className="page-btn active">{logPage}</button>
                          <button
                            className="page-btn"
                            onClick={() =>
                              setLogPage((p) => Math.min(logsData.pagination.totalPages, p + 1))
                            }
                            disabled={logPage === logsData.pagination.totalPages}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {/* User Detail Panel - Shows when a user is clicked */}
              {selectedUser && (
                <div className="user-detail-panel">
                  <div className="detail-panel-header">
                    <button className="back-btn" onClick={() => setSelectedUser(null)}>
                      <ArrowLeft size={16} />
                      Back
                    </button>
                    <h3>User Attendance Detail</h3>
                  </div>

                  <div className="user-info-card">
                    <div className="user-info-row">
                      <span className="info-label">Raw Absensi ID:</span>
                      <span className="info-value mono">{selectedUser.raw_id}</span>
                    </div>
                    {selectedUser.parsed_employee_code && (
                      <div className="user-info-row">
                        <span className="info-label">Employee Code:</span>
                        <span className="info-value mono success">{selectedUser.parsed_employee_code}</span>
                      </div>
                    )}
                    {selectedUser.mode === 'mesin' && (
                      <div className="user-info-row">
                        <span className="info-label">Nama Mesin:</span>
                        <span className="info-value">{selectedUser.zkteco_user_name || 'Tidak ditemukan di user mesin'}</span>
                      </div>
                    )}
                    {selectedUser.mode === 'database' && selectedUser.employee_name && (
                      <div className="user-info-row">
                        <span className="info-label">Employee Name:</span>
                        <span className="info-value">{selectedUser.employee_name}</span>
                      </div>
                    )}
                    {selectedUser.mapping_reason && (
                      <div className="user-info-row">
                        <span className="info-label">Reason:</span>
                        <span className="info-value text-muted">{selectedUser.mapping_reason}</span>
                      </div>
                    )}
                    <div className="user-info-row">
                      <span className="info-label">Machine:</span>
                      <span className="info-value">{selectedUser.machine_code}</span>
                    </div>
                    <div className="user-info-row">
                      <span className="info-label">Status:</span>
                      <span className={`badge-organic ${
                        selectedUser.mapping_status === 'MAPPED' ? 'mapped' : 'unmapped'
                      }`}>
                        {selectedUser.mapping_status || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div className="attendance-section">
                    <h4><Calendar size={16} /> Attendance Matrix</h4>
                    {attendanceLoading ? (
                      <div className="loading-state">
                        <Loader size={20} className="animate-spin" />
                        <span>Loading attendance...</span>
                      </div>
                    ) : userAttendance && Array.isArray(userAttendance.attendance) && userAttendance.attendance.length > 0 ? (
                      <div className="attendance-matrix-wrapper">
                        <table className="attendance-matrix-table">
                          <thead>
                            <tr>
                              <th>No</th>
                              <th>Tanggal</th>
                              <th>Hari</th>
                              <th>Status</th>
                              <th>Check In</th>
                              <th>Check Out</th>
                              <th>Scans</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userAttendance.attendance.map((record: any, idx: number) => {
                              // date is already a string like "2026-06-01"
                              const dateStr = String(record.date || '');
                              const dateObj = new Date(dateStr + 'T00:00:00');
                              const dayName = !isNaN(dateObj.getTime())
                                ? dateObj.toLocaleDateString('id-ID', { weekday: 'long' })
                                : record.date;
                              const formattedDate = !isNaN(dateObj.getTime())
                                ? dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                                : record.date;

                              // Parse time - first_scan/last_scan are TIME only (e.g., "06:07:00" or "14:30:00")
                              const parseTime = (timeStr: string | null | undefined) => {
                                if (!timeStr) return '-';
                                // Try to extract HH:mm from various time formats
                                const str = String(timeStr).trim();
                                // Format: HH:mm:ss or HH.mm.ss or HH:mm
                                const match = str.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
                                if (match) {
                                  return `${match[1].padStart(2, '0')}.${match[2]}`;
                                }
                                // Already formatted time string
                                if (str.includes('.')) {
                                  const parts = str.split('.');
                                  if (parts.length >= 2) {
                                    return `${parts[0].padStart(2, '0')}.${parts[1]}`;
                                  }
                                }
                                return str;
                              };

                              const statusClass = record.status === 'HADIR' ? 'hadir'
                                : record.status === 'INCOMPLETE_SCAN' || record.status === 'NO_CHECKOUT' ? 'no-checkout'
                                : 'tidak-hadir';

                              return (
                                <tr key={idx}>
                                  <td className="col-no">{idx + 1}</td>
                                  <td className="col-date">{formattedDate}</td>
                                  <td className="col-day">{dayName}</td>
                                  <td className="col-status">
                                    <span className={`status-badge ${statusClass}`}>
                                      {record.status === 'HADIR' ? 'HADIR'
                                        : record.status === 'INCOMPLETE_SCAN' || record.status === 'NO_CHECKOUT' ? 'SCAN TUNGGAL'
                                        : 'TIDAK HADIR'}
                                    </span>
                                  </td>
                                  <td className="col-time">{parseTime(record.first_scan)}</td>
                                  <td className="col-time">{parseTime(record.last_scan)}</td>
                                  <td className="col-scans">{record.scan_count}x</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : userAttendance ? (
                      <p className="no-data">No attendance records found for this user</p>
                    ) : (
                      <p className="no-data">Select a user to view attendance</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <style>{`
        .loading-state, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
        }

        .error-state {
          color: var(--error);
        }

        .empty-state-inline {
          text-align: center;
          padding: 24px;
          color: var(--text-tertiary);
        }

        .empty-state-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .empty-state-content .empty-icon {
          color: var(--text-tertiary);
          opacity: 0.5;
          margin-bottom: 8px;
        }

        .empty-state-content .empty-hint {
          font-size: var(--font-size-sm);
          color: var(--text-tertiary);
        }

        .records-subtabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .subtab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          background: var(--surface-card);
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .subtab-btn:hover {
          background: var(--surface-muted);
        }

        .subtab-btn.active {
          background: var(--brand-primary);
          color: var(--text-inverse);
          border-color: var(--brand-primary);
        }

        .records-search {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .records-search .search-input-wrap {
          flex: 1;
        }

        .user-avatar.unmapped {
          background: var(--gray-300);
          color: var(--text-tertiary);
        }

        .user-avatar.raw {
          background: #3B82F6;
          color: white;
        }

        /* Mode Toggle Styles */
        .data-mode-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          padding: 4px;
          background: var(--surface-muted);
          border-radius: var(--radius-lg);
        }

        .mode-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border: none;
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .mode-btn:hover {
          background: var(--surface-card);
        }

        .mode-btn.active.mesin {
          background: #3B82F6;
          color: white;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .mode-btn.active.database {
          background: #10B981;
          color: white;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .device-uid {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--text-primary);
        }

        .raw-id-length {
          font-size: 10px;
          color: var(--text-tertiary);
          margin-left: 4px;
        }

        .badge-organic.unmapped {
          background: #FEF3C7;
          color: #92400E;
        }

        .badge-organic.unmapped.long-id {
          background: #FEE2E2;
          color: #991B1B;
        }

        .scan-count {
          background: var(--surface-muted);
          padding: 4px 10px;
          border-radius: var(--radius-full);
          font-size: var(--font-size-sm);
          font-weight: 600;
        }

        .last-seen {
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
        }

        .mode-indicator {
          font-size: var(--font-size-xs);
          font-weight: 600;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          margin-left: 8px;
        }

        .mode-indicator.mesin {
          background: rgba(59, 130, 246, 0.1);
          color: #3B82F6;
        }

        .mode-indicator.database {
          background: rgba(16, 185, 129, 0.1);
          color: #10B981;
        }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .user-cell .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-full);
          background: var(--brand-primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--font-size-sm);
          font-weight: 700;
          flex-shrink: 0;
        }

        .user-cell .user-name {
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--font-size-sm);
        }

        .user-cell .user-code {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
        }

        /* Clickable rows */
        .clickable-row {
          cursor: pointer;
          transition: background-color var(--duration-fast);
        }

        .clickable-row:hover {
          background-color: var(--surface-muted);
        }

        /* User Detail Panel */
        .user-detail-panel {
          margin-top: 16px;
          padding: 16px;
          background: var(--surface-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }

        .detail-panel-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .detail-panel-header h3 {
          margin: 0;
          font-size: var(--font-size-md);
          font-weight: 600;
        }

        .back-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .back-btn:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .user-info-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: var(--surface-muted);
          border-radius: var(--radius-md);
          margin-bottom: 16px;
        }

        .user-info-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-info-row .info-label {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          min-width: 100px;
        }

        .user-info-row .info-value {
          font-size: var(--font-size-sm);
          font-weight: 500;
        }

        .user-info-row .info-value.mono {
          font-family: var(--font-mono);
        }

        .user-info-row .info-value.success {
          color: #10B981;
        }

        .attendance-section {
          margin-top: 12px;
        }

        .attendance-section h4 {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0 0 12px 0;
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-primary);
        }

        .attendance-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .attendance-item, .scan-log-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: var(--surface-muted);
          border-radius: var(--radius-md);
          font-size: var(--font-size-sm);
        }

        .attendance-date {
          font-weight: 500;
          min-width: 80px;
        }

        .attendance-status .status-badge {
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          font-weight: 600;
        }

        .status-badge.hadir {
          background: #D1FAE5;
          color: #065F46;
        }

        .status-badge.absent {
          background: #FEE2E2;
          color: #991B1B;
        }

        .status-badge.other {
          background: #E5E7EB;
          color: #374151;
        }

        .attendance-time {
          display: flex;
          gap: 12px;
          color: var(--text-secondary);
          font-size: var(--font-size-xs);
        }

        .scan-time {
          font-family: var(--font-mono);
          min-width: 120px;
        }

        .scan-info {
          flex: 1;
        }

        .no-data {
          text-align: center;
          color: var(--text-tertiary);
          padding: 24px;
          font-size: var(--font-size-sm);
        }

        /* Attendance Matrix Table */
        .attendance-matrix-wrapper {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }

        .attendance-matrix-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--font-size-sm);
        }

        .attendance-matrix-table th {
          position: sticky;
          top: 0;
          background: var(--surface-muted);
          padding: 10px 12px;
          text-align: left;
          font-weight: 600;
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
          z-index: 1;
        }

        .attendance-matrix-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
        }

        .attendance-matrix-table tr:hover td {
          background: var(--surface-muted);
        }

        .attendance-matrix-table tr:last-child td {
          border-bottom: none;
        }

        .attendance-matrix-table .col-no {
          width: 40px;
          text-align: center;
          color: var(--text-tertiary);
          font-size: var(--font-size-xs);
        }

        .attendance-matrix-table .col-date {
          font-weight: 500;
          white-space: nowrap;
        }

        .attendance-matrix-table .col-day {
          color: var(--text-secondary);
          font-size: var(--font-size-xs);
        }

        .attendance-matrix-table .col-status {
          width: 120px;
        }

        .attendance-matrix-table .col-time {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
        }

        .attendance-matrix-table .col-scans {
          text-align: center;
          width: 50px;
        }

        .attendance-matrix-table .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          font-weight: 600;
        }

        .attendance-matrix-table .status-badge.hadir {
          background: #D1FAE5;
          color: #065F46;
        }

        .attendance-matrix-table .status-badge.no-checkout {
          background: #FEF3C7;
          color: #92400E;
        }

        .attendance-matrix-table .status-badge.tidak-hadir {
          background: #FEE2E2;
          color: #991B1B;
        }
      `}</style>
    </>
  );
}
