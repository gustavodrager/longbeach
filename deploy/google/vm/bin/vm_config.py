"""Pure, tested configuration translation; never logs or persists secret values."""
import re

SAFETY = {
    'Database__MigrateOnStartup': 'false',
    'Authorization__SeedOnStartup': 'false',
    'Bootstrap__InitialOwner__Enabled': 'false',
    'Authentication__Google__ProvisionAllowedEmailsAsOwners': 'false',
    'Integrations__Banking__ImportOnly': 'true',
    'Integrations__C6__Enabled': 'false',
    'Integrations__C6__BankingEnabled': 'false',
    'Integrations__C6__PixEnabled': 'false',
    'Integrations__PagBankEdi__Enabled': 'false',
    'Payments__Billing__Enabled': 'false',
    'Payments__PagBank__Enabled': 'false',
    'Payments__PagBank__PixEnabled': 'false',
    'Payments__PagBank__CardEnabled': 'false',
    'Payments__PagBankSubscriptions__Enabled': 'false',
}
PROJECT = 'parsero-prod-20261022'
DOMAIN = 'api.longbeach.quebranunca.com.br'
WEB_ORIGIN = 'https://longbeach.quebranunca.com.br'

def require(condition, code):
    if not condition:
        raise ValueError(code)

def validate_manifest(m):
    require(m.get('schema_version') == 1 and m.get('project_id') == PROJECT, 'wrong-manifest-project')
    require(m.get('api_domain') == DOMAIN and m.get('web_origin') == WEB_ORIGIN, 'wrong-domains')
    require(re.fullmatch(r'southamerica-east1-docker\.pkg\.dev/' + PROJECT + r'/longbeach/api@sha256:[a-f0-9]{64}', m.get('api_image', '')), 'immutable-api-image-required')
    require(re.fullmatch(r'southamerica-east1-docker\.pkg\.dev/' + PROJECT + r'/longbeach/[a-z0-9-]+@sha256:[a-f0-9]{64}', m.get('postgres_backup_image', '')), 'immutable-backup-image-required')
    require(m.get('data') == {'device': '/dev/disk/by-id/google-longbeach-postgres', 'mount_path': '/var/lib/longbeach'}, 'wrong-data-device-or-mount')
    require(m.get('gates') == {'database_restore_approved': False, 'runtime_enabled': False, 'workers_enabled': False}, 'bootstrap-cannot-authorize-live-runtime')
    require(re.fullmatch(PROJECT + r'-longbeach-[a-z0-9-]+', m.get('backup', {}).get('bucket', '')), 'wrong-backup-bucket')
    require(m.get('backup', {}).get('prefix') == 'pgbackrest/longbeach/', 'wrong-backup-prefix')
    for key, ref in m.get('secret_refs', {}).items():
        require(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', key), 'invalid-config-name')
        require(re.fullmatch(r'longbeach-[a-z0-9-]+', ref.get('secret_id', '')), 'wrong-secret-id')
        require(re.fullmatch(r'[1-9][0-9]*', str(ref.get('version', ''))), 'numeric-secret-version-required')
    require('ConnectionStrings__LongBeach' in m.get('secret_refs', {}) and 'Authentication__Jwt__SigningKey' in m['secret_refs'], 'required-source-secrets-missing')
    admin=m.get('postgres_admin_secret', {})
    require(admin.get('secret_id') == 'longbeach-vm-postgres-admin-password' and re.fullmatch(r'[1-9][0-9]*', str(admin.get('version',''))), 'wrong-vm-admin-secret')
    for key, value in m.get('public_environment', {}).items():
        require(isinstance(value, str) and '\x00' not in value, 'invalid-config-value')
        require(key not in m['secret_refs'], 'secret-and-public-config-collision')
    for key, value in SAFETY.items():
        if key in m.get('public_environment', {}):
            require(m['public_environment'][key].lower() == value, 'unsafe-source-integration-or-startup-flag')
    return m

def parse_connection_string(source):
    """ADO.NET key/value quoting, including embedded semicolons and doubled quotes."""
    require(isinstance(source, str) and '\x00' not in source, 'invalid-connection-string')
    values={}; i=0
    while i < len(source):
        while i < len(source) and (source[i].isspace() or source[i] == ';'): i+=1
        if i == len(source): break
        start=i
        while i < len(source) and source[i] not in '=;': i+=1
        require(i < len(source) and source[i] == '=', 'connection-key-missing-value')
        key=source[start:i].strip().lower(); require(key and key not in values, 'duplicate-connection-key')
        i+=1
        while i < len(source) and source[i].isspace(): i+=1
        if i < len(source) and source[i] in ('"', "'"):
            quote=source[i]; i+=1; parts=[]; closed=False
            while i < len(source):
                if source[i] == quote:
                    if i+1 < len(source) and source[i+1] == quote: parts.append(quote); i+=2; continue
                    closed=True; i+=1; break
                parts.append(source[i]); i+=1
            require(closed, 'unterminated-connection-value')
            while i < len(source) and source[i].isspace(): i+=1
            require(i == len(source) or source[i] == ';', 'characters-after-quoted-value')
            value=''.join(parts)
        else:
            start=i
            while i < len(source) and source[i] != ';': i+=1
            value=source[start:i].strip()
        values[key]=value
        if i < len(source): i+=1
    return values

def database_credentials(source):
    values=parse_connection_string(source)
    def one(names):
        found=[values[n] for n in names if n in values]
        require(len(found) == 1 and bool(found[0]), 'missing-or-ambiguous-connection-identity')
        return found[0]
    database=one(('database','initial catalog'))
    user=one(('username','user id','user name','userid','uid','user'))
    password=one(('password','pwd'))
    require(database == 'longbeach' and re.fullmatch(r'longbeach_[a-z0-9_]+', user), 'unexpected-source-database-or-role')
    require(user not in ('postgres','longbeach_admin'), 'runtime-must-not-be-admin')
    return database,user,password

def quote_value(value):
    return '"' + value.replace('"', '""') + '"'

def local_connection_string(source):
    database,user,password=database_credentials(source)
    return ('Host=postgres;Port=5432;Database=' + quote_value(database) + ';Username=' + quote_value(user)
            + ';Password=' + quote_value(password) + ';SSL Mode=Disable;Pooling=true;Minimum Pool Size=0;Maximum Pool Size=30;Timeout=15;Command Timeout=30')

def app_config(manifest, secret_values):
    validate_manifest(manifest)
    require(set(secret_values) == set(manifest['secret_refs']), 'secret-set-mismatch')
    values=dict(manifest['public_environment']); values.update(secret_values); values.update(SAFETY)
    values['ConnectionStrings__LongBeach']=local_connection_string(values['ConnectionStrings__LongBeach'])
    values['BackgroundJobs__Enabled']='false'
    values['ReverseProxy__TrustAllForwarders']='true'
    result={}
    for key,value in values.items():
        path=key.split('__'); node=result
        for part in path[:-1]:
            require(part not in node or isinstance(node[part],dict), 'config-prefix-collision')
            node=node.setdefault(part,{})
        require(path[-1] not in node, 'duplicate-config-path')
        node[path[-1]]=value
    return result
