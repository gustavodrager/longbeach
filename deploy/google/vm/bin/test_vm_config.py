import copy, unittest
import vm_config as c

def manifest():
    return {'schema_version':1,'project_id':c.PROJECT,'api_domain':c.DOMAIN,'web_origin':c.WEB_ORIGIN,
      'api_image':'southamerica-east1-docker.pkg.dev/'+c.PROJECT+'/longbeach/api@sha256:'+'a'*64,
      'postgres_backup_image':'southamerica-east1-docker.pkg.dev/'+c.PROJECT+'/longbeach/postgres-backup@sha256:'+'b'*64,
      'data':{'device':'/dev/disk/by-id/google-longbeach-postgres','mount_path':'/var/lib/longbeach'},
      'gates':{'database_restore_approved':False,'runtime_enabled':False,'workers_enabled':False},
      'backup':{'bucket':c.PROJECT+'-longbeach-vm-backups','prefix':'pgbackrest/longbeach/'},
      'secret_refs':{'ConnectionStrings__LongBeach':{'secret_id':'longbeach-db-runtime-connection','version':'1'},'Authentication__Jwt__SigningKey':{'secret_id':'longbeach-jwt-signing-key','version':'1'}},
      'postgres_admin_secret':{'secret_id':'longbeach-vm-postgres-admin-password','version':'1'},
      'public_environment':{'Cors__AllowedOrigins__0':c.WEB_ORIGIN,'Authentication__Jwt__Issuer':'LongBeach.OS'}}

class ConfigurationSafety(unittest.TestCase):
    def test_quoted_password_roundtrip_preserves_credentials_and_discards_cloud_host(self):
        source='Host=/cloudsql/project:region:source;Database=longbeach;Username=longbeach_runtime;Password="p;a""s=s word";SSL Mode=Require'
        result=c.local_connection_string(source)
        self.assertEqual(c.database_credentials(result),('longbeach','longbeach_runtime','p;a"s=s word'))
        parsed=c.parse_connection_string(result)
        self.assertEqual(parsed['host'],'postgres'); self.assertEqual(parsed['maximum pool size'],'30')
        self.assertNotIn('source',result)
    def test_single_quoted_values(self):
        self.assertEqual(c.database_credentials("Database=longbeach;User ID=longbeach_runtime;Pwd='abc;d''e'"),('longbeach','longbeach_runtime',"abc;d'e"))
    def test_ambiguous_and_admin_roles_fail_closed(self):
        for source in ('Database=longbeach;Username=postgres;Password=x','Database=other;Username=longbeach_runtime;Password=x','Database=longbeach;Username=longbeach_runtime;UID=longbeach_owner;Password=x','Database=longbeach;Username=longbeach_runtime;Password=x;Password=y'):
            with self.subTest(source=source), self.assertRaises(ValueError): c.database_credentials(source)
    def test_malformed_quoting_is_not_silently_reinterpreted(self):
        for value in ('Password="abc','Password="abc"suffix','Password;Username=someone','Password=x\x00y'):
            with self.subTest(value=value), self.assertRaises(ValueError):c.parse_connection_string(value)
    def test_bootstrap_refuses_public_runtime_or_wrong_data_disk(self):
        for mutation in (lambda m:m['gates'].update(runtime_enabled=True),lambda m:m['data'].update(device='/dev/sda'),lambda m:m.update(api_domain='other.example'),lambda m:m['secret_refs']['ConnectionStrings__LongBeach'].update(version='latest')):
            m=manifest();mutation(m)
            with self.assertRaises(ValueError):c.validate_manifest(m)
    def test_import_only_cannot_resume_provider_operations(self):
        for key,value in c.SAFETY.items():
            m=manifest();m['public_environment'][key]='false' if value=='true' else 'true'
            with self.subTest(key=key),self.assertRaises(ValueError):c.validate_manifest(m)
    def test_real_secret_sets_nested_configuration_and_preserves_key_material(self):
        m=manifest(); original=copy.deepcopy(m); secret='fictional-key-for-unit-tests-only'
        values={'ConnectionStrings__LongBeach':'Database=longbeach;Username=longbeach_runtime;Password="a;b"','Authentication__Jwt__SigningKey':secret}
        result=c.app_config(m,values)
        self.assertEqual(result['Authentication']['Jwt']['SigningKey'],secret)
        self.assertEqual(result['Cors']['AllowedOrigins']['0'],c.WEB_ORIGIN)
        self.assertEqual(result['BackgroundJobs']['Enabled'],'false')
        self.assertEqual(result['Integrations']['Banking']['ImportOnly'],'true')
        self.assertEqual(m,original)
    def test_missing_secret_is_not_accepted(self):
        with self.assertRaises(ValueError):c.app_config(manifest(),{})
    def test_secret_value_cannot_enter_plain_configuration(self):
        m=manifest();m['public_environment']['Authentication__Jwt__SigningKey']='oops'
        with self.assertRaises(ValueError):c.validate_manifest(m)

if __name__=='__main__':unittest.main()
