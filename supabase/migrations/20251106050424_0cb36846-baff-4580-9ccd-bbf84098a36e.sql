-- Add foreign key constraints with CASCADE delete to ensure clean room deletion

-- Add foreign key for participants.room_id
ALTER TABLE participants
DROP CONSTRAINT IF EXISTS participants_room_id_fkey,
ADD CONSTRAINT participants_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES rooms(id) 
ON DELETE CASCADE;

-- Add foreign key for messages.room_id
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_room_id_fkey,
ADD CONSTRAINT messages_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES rooms(id) 
ON DELETE CASCADE;

-- Add foreign key for video_state.room_id
ALTER TABLE video_state
DROP CONSTRAINT IF EXISTS video_state_room_id_fkey,
ADD CONSTRAINT video_state_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES rooms(id) 
ON DELETE CASCADE;