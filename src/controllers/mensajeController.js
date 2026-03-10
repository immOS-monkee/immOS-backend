const supabase = require('../config/supabase');

// List recent conversations (last message with each unique user)
exports.getMisChats = async (req, res) => {
    try {
        const userId = req.user.id;

        // Query messages where user is sender or receiver
        const { data: messages, error } = await supabase
            .from('mensajes')
            .select('*')
            .or(`remitente_id.eq.${userId},destinatario_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by 'the other person'
        const chats = [];
        const seenUsers = new Set();

        // Collect unique IDs of other users to fetch their names
        const otherUserIds = [...new Set(messages.map(m => m.remitente_id === userId ? m.destinatario_id : m.remitente_id))];

        const { data: usersInfo } = await supabase.from('usuarios').select('id, nombre').in('id', otherUserIds);
        const userMap = Object.fromEntries(usersInfo?.map(u => [u.id, u]) || []);

        messages.forEach(m => {
            const otherId = m.remitente_id === userId ? m.destinatario_id : m.remitente_id;
            if (otherId && !seenUsers.has(otherId)) {
                seenUsers.add(otherId);
                const otherUser = userMap[otherId] || { id: otherId, nombre: 'Usuario' };
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

        // Validación Quirúrgica: Evitar error 500 si el ID no es un UUID (ej. "grupal")
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(otherUserId)) {
            return res.status(400).json({ error: 'ID de usuario inválido' });
        }

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

// --- CHAT GRUPAL (CUARTEL GENERAL) ---

exports.getMensajesGrupales = async (req, res) => {
    try {
        const { data: messages, error } = await supabase
            .from('chat_grupal_interno')
            .select('*') // No join here until FK is fixed
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;

        // Fetch sender names manually
        const senderIds = [...new Set(messages.map(m => m.remitente_id))];
        const { data: users } = await supabase.from('usuarios').select('id, nombre').in('id', senderIds);
        const userMap = Object.fromEntries(users?.map(u => [u.id, u]) || []);

        const enrichedMessages = messages.map(m => ({
            ...m,
            sender: userMap[m.remitente_id] || { nombre: 'Desconocido' }
        }));

        res.json(enrichedMessages);
    } catch (error) {
        console.error('Get Group Messages Error:', error);
        res.status(500).json({ error: 'Error al obtener chat grupal' });
    }
};

exports.enviarMensajeGrupal = async (req, res) => {
    try {
        const { contenido } = req.body;
        const remitente_id = req.user.id;

        if (!contenido) return res.status(400).json({ error: 'Contenido obligatorio' });

        const { data: message, error } = await supabase
            .from('chat_grupal_interno')
            .insert([{ remitente_id, contenido }])
            .select()
            .single();

        if (error) throw error;

        // Fetch user info for response consistency
        const { data: user } = await supabase.from('usuarios').select('id, nombre').eq('id', remitente_id).single();
        message.sender = user;

        res.status(201).json(message);
    } catch (error) {
        console.error('Send Group Message Error:', error);
        res.status(500).json({ error: 'Error al enviar al grupo' });
    }
};
