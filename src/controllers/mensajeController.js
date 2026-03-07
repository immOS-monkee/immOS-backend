const supabase = require('../config/supabase');

// List recent conversations (last message with each unique user)
exports.getMisChats = async (req, res) => {
    try {
        const userId = req.user.id;

        // Simplified approach: find distinct users the current user has messaged
        // In a real app, a 'conversaciones' table is better.
        // For surgical simplicity, we query messages where the user is part of.
        const { data: messages, error } = await supabase
            .from('mensajes')
            .select('*, sender:remitente_id(id, nombre), receiver:destinatario_id(id, nombre)')
            .or(`remitente_id.eq.${userId},destinatario_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by 'the other person'
        const chats = [];
        const seenUsers = new Set();

        messages.forEach(m => {
            const otherUser = m.remitente_id === userId ? m.receiver : m.sender;
            if (otherUser && !seenUsers.has(otherUser.id)) {
                seenUsers.add(otherUser.id);
                chats.push({
                    user: otherUser,
                    lastMessage: m.contenido,
                    lastDate: m.created_at,
                    unread: m.destinatario_id === userId && !m.leido
                });
            }
        });

        res.json(chats);
    } catch (error) {
        console.error('Get Chats Error:', error);
        res.status(500).json({ error: 'Error al obtener conversaciones' });
    }
};

// Get all messages between current user and target user
exports.getMensajesConUsuario = async (req, res) => {
    try {
        const userId = req.user.id;
        const { otherUserId } = req.params;

        const { data: messages, error } = await supabase
            .from('mensajes')
            .select('*')
            .or(`and(remitente_id.eq.${userId},destinatario_id.eq.${otherUserId}),and(remitente_id.eq.${otherUserId},destinatario_id.eq.${userId})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Mark as read if user is receiver
        await supabase
            .from('mensajes')
            .update({ leido: true })
            .eq('destinatario_id', userId)
            .eq('remitente_id', otherUserId)
            .eq('leido', false);

        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
};

// Send a message
exports.enviarMensaje = async (req, res) => {
    try {
        const { destinatario_id, contenido } = req.body;
        const remitente_id = req.user.id;

        if (!destinatario_id || !contenido) {
            return res.status(400).json({ error: 'destinatario_id y contenido son obligatorios' });
        }

        const { data: message, error } = await supabase
            .from('mensajes')
            .insert([{
                remitente_id,
                destinatario_id,
                contenido,
                leido: false,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
};
