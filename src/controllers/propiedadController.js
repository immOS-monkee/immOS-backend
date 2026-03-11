const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');

// === CREATE ===
exports.createPropiedad = async (req, res) => {
    try {
        const agente_id = req.user.id;
        const {
            direccion, ciudad, tipo_propiedad, operacion,
            precio_venta, precio_alquiler, caracteristicas,
            coordenadas, vendedor_id, captacion_id,
            images
        } = req.body;

        if (!direccion || !tipo_propiedad || !operacion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios: direccion, tipo_propiedad, operacion' });
        }

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .insert([{
                agente_id,
                vendedor_id: vendedor_id || null,
                direccion,
                ciudad: ciudad || 'Sin definir',
                tipo_propiedad,
                operacion,
                precio_venta: precio_venta || null,
                precio_alquiler: precio_alquiler || null,
                caracteristicas: caracteristicas || {},
                estado: 'disponible'
            }])
            .select()
            .single();

        if (error) throw error;

        // If converted from a capture, update captacion status
        if (captacion_id) {
            await supabase
                .from('captaciones_campo')
                .update({ status: 'convertida' })
                .eq('id', captacion_id);
        }

        if (images && images.length > 0) {
            const mediaRecords = images.map((url, idx) => ({
                propiedad_id: propiedad.id,
                url,
                tipo: 'foto',
                orden: idx,
                es_principal: idx === 0
            }));

            await supabase.from('multimedia_propiedad').insert(mediaRecords);
        }

        res.status(201).json({ message: 'Propiedad creada', propiedad });
    } catch (error) {
        console.error('Create Propiedad Error:', error);
        res.status(500).json({ error: error.message || error.details || 'Error interno de base de datos' });
    }
};

// === LIST ===
exports.getPropiedades = async (req, res) => {
    try {
        const { estado, tipo, operacion, agente_id: filterAgent } = req.query;
        const rol = req.user.rol;
        const userId = req.user.id;

        let query = supabase.from('propiedades').select('*, multimedia_propiedad(url, orden, es_principal, tipo)');

        // Role-based visibility (Surgical Intervention)
        if (rol === 'agente_captacion') {
            query = query.eq('agente_id', userId);
        } else if (rol === 'propietario') {
            // Bridge: Find cliente ID by user email
            const { data: cliente } = await supabase
                .from('clientes')
                .select('id')
                .eq('email', req.user.email || '')
                .single();

            if (cliente) {
                query = query.eq('vendedor_id', cliente.id);
            } else {
                // Return no results if bridge fails
                return res.json([]);
            }
        } else if (rol === 'comprador') {
            // Buyers only see available properties
            query = query.eq('estado', 'disponible');
        }
        if (filterAgent) query = query.eq('agente_id', filterAgent);
        if (estado) query = query.eq('estado', estado);
        if (tipo) query = query.eq('tipo_propiedad', tipo);
        if (operacion) query = query.eq('operacion', operacion);

        query = query.order('created_at', { ascending: false });

        const { data: propiedades, error } = await query;
        if (error) throw error;

        res.json(propiedades);
    } catch (error) {
        console.error('List Propiedades Error:', error);
        res.status(500).json({ error: 'Error al listar propiedades' });
    }
};

// === DETAIL ===
exports.getPropiedad = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .select('*, multimedia_propiedad(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!propiedad) return res.status(404).json({ error: 'Propiedad no encontrada' });

        res.json(propiedad);
    } catch (error) {
        console.error('Get Propiedad Error:', error);
        res.status(500).json({ error: 'Error al obtener la propiedad' });
    }
};

// === UPDATE ===
exports.updatePropiedad = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        
        // Limpieza quirúrgica de campos relacionales o protegidos que Supabase rechazaría
        delete updates.id;
        delete updates.agente_id; 
        delete updates.multimedia_propiedad;
        delete updates.updated_at;
        delete updates.created_at;
        delete updates.fecha_estado;
        delete updates.vendedor_id;
        
        updates.updated_at = new Date().toISOString();

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Propiedad actualizada', propiedad });
    } catch (error) {
        console.error('Update Propiedad Error:', error);
        res.status(500).json({ error: 'Error al actualizar la propiedad' });
    }
};

// === CHANGE STATE ===
exports.changeEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const validStates = ['disponible', 'reservada', 'vendida_pendiente_archivo', 'vendida_archivada', 'alquilada_pendiente_archivo', 'alquilada_archivada', 'inactiva', 'oculta'];
        if (!validStates.includes(estado)) {
            return res.status(400).json({ error: 'Estado no válido' });
        }

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .update({ estado, fecha_estado: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Module 10: Automatizaciones
        if (estado === 'disponible') await fireRules('propiedad_disponible', { entidad_id: id, direccion: propiedad.direccion });
        if (estado === 'reservada') await fireRules('propiedad_reservada', { entidad_id: id, direccion: propiedad.direccion });

        res.json({ message: `Estado cambiado a ${estado}`, propiedad });
    } catch (error) {
        console.error('Change Estado Error:', error);
        res.status(500).json({ error: 'Error al cambiar el estado' });
    }
};

// === CONVERT CAPTACION → PROPIEDAD ===
exports.convertFromCaptacion = async (req, res) => {
    try {
        const { captacion_id } = req.params;
        const agente_id = req.user.id;

        // Fetch the captacion
        const { data: captacion, error: captError } = await supabase
            .from('captaciones_campo')
            .select('*')
            .eq('id', captacion_id)
            .single();

        if (captError || !captacion) return res.status(404).json({ error: 'Captación no encontrada' });

        const d = captacion.data;

        // Build new property from capture data
        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .insert([{
                agente_id,
                direccion: d.address || 'Sin dirección',
                ciudad: d.city || 'Sin definir',
                tipo_propiedad: d.type || 'piso',
                operacion: d.operation || 'venta',
                precio_venta: d.operation === 'venta' ? (d.price || null) : null,
                precio_alquiler: d.operation === 'alquiler' ? (d.price || null) : null,
                caracteristicas: d.characteristics || {},
                vendedor_id: d.vendedor_id || null, // Vínculo quirúrgico al propietario
                estado: 'disponible'
            }])
            .select()
            .single();

        if (error) throw error;

        // Upload images from base64 in capture (store as multimedia)
        if (d.images && d.images.length > 0) {
            const mediaRecords = d.images.map((url, idx) => ({
                propiedad_id: propiedad.id,
                url,
                tipo: 'foto',
                orden: idx,
                es_principal: idx === 0
            }));

            await supabase.from('multimedia_propiedad').insert(mediaRecords);
        }

        // Mark captacion as converted
        await supabase
            .from('captaciones_campo')
            .update({ status: 'convertida' })
            .eq('id', captacion_id);

        res.status(201).json({ message: 'Captación convertida a propiedad', propiedad });
    } catch (error) {
        console.error('Convert Captacion Error:', error);
        res.status(500).json({ error: 'Error al convertir la captación' });
    }
};

// === DELETE ===
exports.deletePropiedad = async (req, res) => {
    try {
        const { id } = req.params;

        // Solo permitir borrar al creador (agente) o a un super_admin/admin si existiera esa validación, 
        // pero por ahora el token nos dice quién es. Podríamos checar roles aquí.
        const rol = req.user.rol;

        // Verificar si existe la propiedad
        const { data: propiedad, error: fetchError } = await supabase
            .from('propiedades')
            .select('agente_id')
            .eq('id', id)
            .single();

        if (fetchError || !propiedad) {
            return res.status(404).json({ error: 'Propiedad no encontrada' });
        }

        // Si es agente_captacion, solo puede borrar suyas; super_admin puede todas.
        if (rol === 'agente_captacion' && propiedad.agente_id !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado para borrar esta propiedad' });
        }

        const { error: deleteError } = await supabase
            .from('propiedades')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Propiedad eliminada correctamente' });
    } catch (error) {
        console.error('Delete Propiedad Error:', error);
        res.status(500).json({ error: error.message || 'Error al eliminar la propiedad' });
    }
};
// === PUBLIC DETAIL (For Landing Pages / Promo) ===
exports.getPropiedadPublica = async (req, res) => {
    try {
        const { id } = req.params;

        // Solo traemos datos no sensibles
        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .select(`
                id, direccion, tipo_propiedad, operacion, 
                precio_venta, precio_alquiler, caracteristicas, 
                descripcion,
                multimedia_propiedad(*)
            `)
            .eq('id', id)
            .eq('estado', 'disponible') // Solo casas a la venta/alquiler
            .single();

        if (error) throw error;
        if (!propiedad) return res.status(404).json({ error: 'Propiedad no disponible o no encontrada' });

        res.json(propiedad);
    } catch (error) {
        console.error('Get Public Propiedad Error:', error);
        res.status(500).json({ error: 'Error al obtener datos públicos de la propiedad' });
    }
};

exports.updateGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const { images } = req.body; // Array de URLs (pueden ser base64)

        if (!Array.isArray(images)) {
            return res.status(400).json({ error: 'Se requiere un array de imágenes' });
        }

        // 1. Eliminar relaciones antiguas en la tabla de multimedia
        const { error: delError } = await supabase
            .from('multimedia_propiedad')
            .delete()
            .eq('propiedad_id', id);

        if (delError) throw delError;

        // 2. Insertar nuevas relaciones con el nuevo orden
        if (images.length > 0) {
            const mediaRecords = images.map((url, idx) => ({
                propiedad_id: id,
                url,
                tipo: 'foto',
                orden: idx,
                es_principal: idx === 0
            }));

            const { error: insError } = await supabase
                .from('multimedia_propiedad')
                .insert(mediaRecords);

            if (insError) throw insError;
        }

        // 3. Obtener la propiedad actualizada con su nueva galería
        const { data: updatedProp, error: fetchError } = await supabase
            .from('propiedades')
            .select('*, multimedia_propiedad(*)')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        res.json({ 
            message: 'Galería actualizada con éxito', 
            propiedad: updatedProp 
        });

    } catch (error) {
        console.error('Update Gallery Error:', error);
        res.status(500).json({ error: 'Error al sincronizar la galería' });
    }
};

// === OWNER METRICS ===
exports.getPropiedadMetricas = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Fetch related tables
        const [visitasRes, ofertasRes] = await Promise.all([
            supabase.from('visitas').select('id, comprador_id, estado, resultado_feedback, fecha_programada').eq('propiedad_id', id),
            supabase.from('ofertas').select('id, comprador_id, estado').eq('propiedad_id', id)
        ]);

        if (visitasRes.error) throw visitasRes.error;
        if (ofertasRes.error) throw ofertasRes.error;

        const visitas = visitasRes.data || [];
        const ofertas = ofertasRes.data || [];

        // 2. Count unique leads (unique buyers)
        const leadsIds = new Set([
            ...visitas.map(v => v.comprador_id),
            ...ofertas.map(o => o.comprador_id)
        ]);
        leadsIds.delete(null);

        // 3. Count active offers
        const activeOffers = ofertas.filter(o => !['rechazada_definitiva', 'cerrada'].includes(o.estado));

        // 4. Extract Feedbacks (ignoring empty or missing ones)
        // Only from 'completada' or 'en_curso' maybe? Let's take any that has text
        const feedbacks = visitas
            .filter(v => v.resultado_feedback?.texto)
            .sort((a,b) => new Date(b.fecha_programada) - new Date(a.fecha_programada))
            .slice(0, 5)
            .map(v => ({
                fecha: v.fecha_programada,
                texto: v.resultado_feedback.texto,
                rating: v.resultado_feedback.rating || null // In case they left an emoji/star
            }));

        // 5. Fake "Online Reach" logic tied to activity to simulate portal traffic
        const visualizaciones = (visitas.length * 25) + (ofertas.length * 45) + (leadsIds.size * 10) + 120; // Base index

        res.json({
            visualizaciones,
            leads: leadsIds.size,
            visitas: visitas.length,
            ofertasActivas: activeOffers.length,
            feedbacks
        });
    } catch (error) {
        console.error('Get Metrics Error:', error);
        res.status(500).json({ error: 'Error calculando métricas de la propiedad' });
    }
};

