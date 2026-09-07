-- ==========================================
-- HABIFY - Combat System Schema
-- ==========================================

-- 1. Monsters Table (PvE)
CREATE TABLE IF NOT EXISTS public.monsters (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sprite TEXT NOT NULL,
    base_level INTEGER NOT NULL,
    base_hp INTEGER NOT NULL,
    base_attack INTEGER NOT NULL,
    xp_reward INTEGER NOT NULL,
    gold_reward INTEGER NOT NULL
);

-- Seed monsters
INSERT INTO public.monsters (name, sprite, base_level, base_hp, base_attack, xp_reward, gold_reward) VALUES 
('Goblin Oscuro', 'goblin', 1, 80, 10, 20, 10),
('Esqueleto Guerrero', 'skeleton', 2, 100, 15, 30, 15),
('Slime Gigante', 'slime', 3, 120, 20, 40, 20),
('Orco Salvaje', 'orc', 4, 150, 25, 50, 25),
('Espectro del Bosque', 'ghost', 5, 200, 30, 80, 40)
ON CONFLICT DO NOTHING;

-- 2. PvP Matches Table (Realtime)
CREATE TABLE IF NOT EXISTS public.pvp_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID REFERENCES auth.users(id),
    player2_id UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'waiting', -- waiting, active, finished
    current_turn UUID REFERENCES auth.users(id),
    p1_hp INTEGER,
    p2_hp INTEGER,
    winner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.monsters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_matches ENABLE ROW LEVEL SECURITY;

-- Policies for monsters (public read)
CREATE POLICY "Monsters are readable by everyone" ON public.monsters
    FOR SELECT USING (true);

-- Policies for pvp_matches (players can read/update their matches)
CREATE POLICY "Players can select their matches" ON public.pvp_matches
    FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Players can insert matches" ON public.pvp_matches
    FOR INSERT WITH CHECK (auth.uid() = player1_id);

CREATE POLICY "Players can update their matches" ON public.pvp_matches
    FOR UPDATE USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Enable Realtime for pvp_matches
ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_matches;
