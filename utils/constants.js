module.exports = {
    USER_ROLES: {
      ADMIN: 'admin',
      OPERATOR: 'operator',
      USER: 'user'
    },
    CERTIFICATE_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected'
    },
    COMMANDS: {
      START: '/start',
      CREATE: '/create',
      CHECK: '/check',
      ADMIN: '/admin',
      USERS: '/users',
      OPERATORS: '/operators',
      STATS: '/stats',
      PENDING: '/pending',
      HELP: '/help'
    },
    ACTIONS: {
      APPROVE_CERTIFICATE: 'approve_certificate',
      REJECT_CERTIFICATE: 'reject_certificate',
      ADD_OPERATOR: 'add_operator',
      REMOVE_OPERATOR: 'remove_operator',
      BLOCK_USER: 'block_user',
      UNBLOCK_USER: 'unblock_user'
    }
  };