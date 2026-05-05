# Visibility Control for osTicket

Controls which ticket statuses each agent/department can see and use, and which departments they can transfer tickets to.

## Requirements

- osTicket 1.18+
- PHP 8.0+
- MySQL 5.7+ / MariaDB 10.3+

## Installation

1. Download the latest release from [GitHub Releases](https://github.com/ChesnoTech/osTicket-visibility-control/releases)
2. Extract into `include/plugins/visibility-control/`
3. In osTicket Admin Panel, go to **Manage > Plugins**
4. Click **Add New Plugin**, select **Visibility Control**, then **Install**
5. Enable the plugin

## How It Works

### Rule Types

| Rule Type | Controls |
|-----------|----------|
| **Status** | Which ticket statuses an agent can see and use in dropdowns |
| **Transfer** | Which departments an agent can transfer tickets to |

### Scope Levels

| Scope | Description |
|-------|-------------|
| **Agent** | Rules applied to a specific staff member |
| **Department** | Rules applied to all agents in a department |

Agent-level rules always take precedence over department-level rules.

### Unrestricted vs Restricted

- **Unrestricted** (default): No rules defined. Agent sees all statuses and can transfer to all departments.
- **Restricted**: Whitelist of allowed items. Only checked statuses/departments are visible.

## Configuration

Navigate to the admin panel via **Manage > Plugins > Visibility Control > Admin Panel** link.

The matrix grid lets you:
- Switch between **Status Rules** and **Transfer Rules** tabs
- Toggle between **By Agent** and **By Department** scope
- Check/uncheck individual items to allow/block them
- Click the X button to remove all restrictions for a row
- Save individual rows or use **Save All** for batch updates
- Search agents by name

## Auto-Updates

The plugin checks GitHub for new releases when you visit the Plugins management page. Updates are categorized as:
- **Minor/Patch**: Same major version (safe to install)
- **Major**: New major version (may contain breaking changes)

Each update creates timestamped backups of both files and database before installing. Failed updates automatically roll back.

## File Structure

```
visibility-control/
├── plugin.php                          # Plugin manifest
├── config.php                          # PluginConfig with table creation
├── class.VisibilityControlPlugin.php   # Main plugin class
├── class.VisibilityControlAjax.php     # AJAX controller
├── class.VisibilityControlUpdater.php  # Auto-updater
├── assets/
│   ├── visibility-control.js           # Client-side DOM filtering
│   ├── visibility-control.css          # Client-side styles
│   ├── visibility-control-admin.js     # Admin matrix UI
│   ├── visibility-control-admin.css    # Admin styles + dark mode
│   ├── vc-updater.js                   # Update panel UI
│   └── vc-updater.css                  # Update panel styles + dark mode
├── CHANGELOG.md
├── README.md
└── LICENSE
```

## Database

The plugin creates one table:

```sql
ost_visibility_control_rules
├── id          (PK, auto-increment)
├── rule_type   (ENUM: status, transfer)
├── scope_type  (ENUM: agent, department)
├── scope_id    (INT: staff_id or dept_id)
├── target_id   (INT: status_id or dept_id)
├── created     (DATETIME)
└── updated     (DATETIME)
```

Each row represents an **allowed** item. No rows for a scope = unrestricted.

## API Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/visibility-control/admin` | Admin | Admin page |
| GET | `/visibility-control/rules` | Admin | All rules as JSON |
| POST | `/visibility-control/rules/save` | Admin | Save rules for one scope |
| GET | `/visibility-control/agents` | Admin | Active staff list |
| GET | `/visibility-control/departments` | Admin | Active departments |
| GET | `/visibility-control/statuses` | Admin | Enabled statuses |
| POST | `/visibility-control/validate/status` | Staff | Check if status allowed |
| POST | `/visibility-control/validate/transfer` | Staff | Check if transfer allowed |
| GET | `/visibility-control/update/check` | Admin | Check for updates |
| POST | `/visibility-control/update/install` | Admin | Install update |

## License

MIT License. See [LICENSE](LICENSE) for details.
