-- Create reactions table for floating emoji reactions
CREATE TABLE public.reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  x_position NUMERIC NOT NULL,
  y_position NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- Create policy for reactions
CREATE POLICY "Allow all operations on reactions" 
ON public.reactions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;