const { PGlite }=require('@electric-sql/pglite');
const fs=require('node:fs');const path=require('node:path');
const user='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const migration=fs.readFileSync(path.join(__dirname,'../../supabase_habit_progression.sql'),'utf8');
async function createFixture(){ const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE public.avatars(id text PRIMARY KEY,user_id uuid REFERENCES auth.users(id),name text DEFAULT 'Hero',level integer DEFAULT 1,current_xp integer DEFAULT 0,
 xp_to_level integer DEFAULT 100,gold integer DEFAULT 50,hp integer DEFAULT 100,max_hp integer DEFAULT 100,is_dead boolean DEFAULT false,updated_at timestamptz DEFAULT now());
 CREATE TABLE public.habits(id text PRIMARY KEY,avatar_id text REFERENCES public.avatars(id),title text,type text,xp_reward integer,hp_penalty integer,gold_reward integer,
 completed_at timestamptz,created_at timestamptz DEFAULT now());
 INSERT INTO auth.users VALUES('${user}'),('${other}');
 INSERT INTO public.avatars(id,user_id) VALUES('a','${user}'),('b','${other}');
 INSERT INTO public.habits(id,avatar_id,title,type,xp_reward,gold_reward,hp_penalty,completed_at) VALUES('old','a','Legacy','positive',20,10,0,now());
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.habits,public.avatars TO authenticated;`);

 await db.exec(migration);
 return db;
}
module.exports={createFixture,user,other,migration};
