const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const NAME='014_create_project_invitations.sql';
const LEGACY='d2ce227d0f6e488b274180e3069a181284d521a11a4ae7ae42ea363f87bd156f';
const CURRENT='a899bc13ebd88b251dae447f4c6e494c04078840ac3c1a022648070775ffdea8';
async function verifiedLegacyHistory(client,migrations,applied){
    const entry=applied.find(row=>row.name===NAME);
    if(!entry || entry.checksum!==LEGACY)return applied;
    const canonical=migrations.find(row=>row.name===NAME);
    const archived=fs.readFileSync(path.join(__dirname,'migrations/archive/014_create_project_invitations_legacy.sql'),'utf8').replaceAll('\r\n','\n');
    if(!canonical || canonical.checksum!==CURRENT || createHash('sha256').update(archived).digest('hex')!==LEGACY || canonical.sql.trimEnd()!==archived.trimEnd())throw new Error('Legacy 014 source cannot be verified; no migration history was changed.');
    const columns=(await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name IN ('users','project_invitations')`)).rows;
    const required={id:'integer',project_id:'integer',email:'character varying',role_id:'integer',invited_by:'integer',status:'character varying',accepted_by:'integer',accepted_at:'timestamp with time zone',created_at:'timestamp with time zone',updated_at:'timestamp with time zone'};
    const matches=Object.entries(required).every(([name,type])=>columns.some(row=>row.table_name==='project_invitations'&&row.column_name===name&&row.data_type===type));
    if(!matches || !columns.some(row=>row.table_name==='users'&&row.column_name==='last_login_at'&&row.data_type==='timestamp with time zone'))throw new Error('Legacy 014 schema cannot be verified; no migration history was changed.');
    for(const [name,type] of [['token_hash','text'],['expires_at','timestamp with time zone']]){
        const column=columns.find(row=>row.table_name==='project_invitations'&&row.column_name===name);
        if(column&&column.data_type!==type)throw new Error('Legacy invitation token schema is incompatible; no migration history was changed.');
    }
    // Validate an acknowledged historical source without rewriting its record.
    // These sources differ only in their final newline. Token columns are
    // already supplied by the unchanged released 017_sprint4_5 migration.
    return applied.map(row=>row===entry?{...row,checksum:canonical.checksum}:row);
}
module.exports={verifiedLegacyHistory,LEGACY_INVITATION_CHECKSUM:LEGACY};
