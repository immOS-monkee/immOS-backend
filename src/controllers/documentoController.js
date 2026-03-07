const PDFDocument = require('pdfkit');
const supabase = require('../config/supabase');

exports.generarFacturaComision = async (req, res) => {
    try {
        const { ofertaId } = req.params;

        // Fetch offer details with relations
        const { data: oferta, error } = await supabase
            .from('ofertas')
            .select(`
                *,
                propiedades (*, vendedor:vendedor_id (*)),
                compradores:comprador_id (*),
                agente:agente_id (*)
            `)
            .eq('id', ofertaId)
            .single();

        if (error || !oferta) {
            return res.status(404).json({ error: 'Oferta no encontrada' });
        }

        const doc = new PDFDocument({ margin: 50 });

        // HTTP Headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Factura_Comision_${ofertaId.slice(0, 8)}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('InmoOS - Factura de Comisión', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, { align: 'right' });
        doc.text(`Nº Factura: INV-${ofertaId.split('-')[0].toUpperCase()}`, { align: 'right' });
        doc.moveDown();

        // Details Grid
        doc.rect(50, doc.y, 500, 2).fill('#D4AF37').stroke(); // Gold accent
        doc.moveDown();

        doc.fontSize(12).fillColor('#D4AF37').text('DETALLES DE LA PROPIEDAD', { underline: true });
        doc.fillColor('black').moveDown(0.5);
        doc.fontSize(10).text(`Dirección: ${oferta.propiedades.address}`);
        doc.text(`Referencia: ${oferta.propiedades.id.slice(0, 8)}`);
        doc.moveDown();

        doc.fontSize(12).fillColor('#D4AF37').text('PARTICIPANTES', { underline: true });
        doc.fillColor('black').moveDown(0.5);
        doc.fontSize(10).text(`Agente: ${oferta.agente?.full_name || 'Agente InmoOS'}`);
        doc.text(`Comprador: ${oferta.compradores?.nombre || 'N/A'}`);
        doc.moveDown();

        doc.fontSize(12).fillColor('#D4AF37').text('DESGLOSE ECONÓMICO', { underline: true });
        doc.fillColor('black').moveDown(0.5);

        const importe = oferta.importe_final || 0;
        const comision = oferta.propiedades.comision_pactada || (importe * 0.03);

        doc.fontSize(10).text(`Importe de Venta: ${importe.toLocaleString('es-ES')} €`, { indent: 20 });
        doc.fontSize(14).text(`TOTAL COMISIÓN: ${comision.toLocaleString('es-ES')} €`, { indent: 20, bold: true });

        doc.moveDown(4);

        // Footer/Signature
        doc.fontSize(8).fillColor('#888').text('InmoOS - El Sistema Operativo Inmobiliario', { align: 'center' });
        doc.text('Este documento es un comprobante de liquidación de comisión generado automáticamente.', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({ error: 'Error al generar PDF' });
    }
};

exports.generarContratoArras = async (req, res) => {
    try {
        const { ofertaId } = req.params;

        // Fetch offer details with relations
        const { data: oferta, error } = await supabase
            .from('ofertas')
            .select(`
                *,
                propiedades (*, vendedor:vendedor_id (*)),
                compradores:comprador_id (*)
            `)
            .eq('id', ofertaId)
            .single();

        if (error || !oferta) {
            return res.status(404).json({ error: 'Oferta no encontrada' });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Contrato_Arras_${ofertaId.slice(0, 8)}.pdf`);

        doc.pipe(res);

        // Header Premium
        doc.fontSize(18).text('CONTRATO DE ARRAS PENITENCIALES', { align: 'center', underline: true });
        doc.moveDown(2);

        doc.fontSize(10).text('REUNIDOS:', { bold: true });
        doc.moveDown(0.5);
        doc.text(`De una parte, como VENDEDOR: ${oferta.propiedades.vendedor?.nombre || '___________________'}`);
        doc.text(`De otra parte, como COMPRADOR: ${oferta.compradores?.nombre || '___________________'}`);
        doc.moveDown();

        doc.text('EXPONEN:', { bold: true });
        doc.moveDown(0.5);
        doc.text(`I. Que el VENDEDOR es propietario de la finca situada en ${oferta.propiedades.address}.`);
        doc.text(`II. Que ambas partes han acordado la compraventa del inmueble por un precio total de ${oferta.importe_final?.toLocaleString('es-ES')} €.`);
        doc.moveDown();

        doc.text('CLÁUSULAS:', { bold: true });
        doc.moveDown(0.5);
        doc.text('PRIMERA.- El comprador entrega en este acto la cantidad de ____________ € en concepto de arras penitenciales.');
        doc.text('SEGUNDA.- El plazo máximo para la formalización de la escritura pública de compraventa será de 90 días naturales.');
        doc.moveDown(2);

        doc.text('Y en prueba de conformidad, firman el presente documento:', { align: 'left' });
        doc.moveDown(3);

        const currentY = doc.y;
        doc.text('EL VENDEDOR', 100, currentY);
        doc.text('EL COMPRADOR', 350, currentY);

        doc.end();

    } catch (error) {
        console.error('PDF Arras Generation Error:', error);
        res.status(500).json({ error: 'Error al generar contrato de arras' });
    }
};

exports.generarContratoAlquiler = async (req, res) => {
    try {
        const { alquilerId } = req.params;

        // Fetch rental details with relations
        const { data: alquiler, error } = await supabase
            .from('alquileres')
            .select(`
                *,
                propiedades (*),
                inquilino:inquilino_id (*),
                vendedor:vendedor_id (*)
            `)
            .eq('id', alquilerId)
            .single();

        if (error || !alquiler) {
            return res.status(404).json({ error: 'Contrato de alquiler no encontrado' });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Contrato_Alquiler_${alquilerId.slice(0, 8)}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(18).fillColor('#D4AF37').text('CONTRATO DE ARRENDAMIENTO DE VIVIENDA', { align: 'center', underline: true });
        doc.moveDown(2);

        doc.fontSize(10).fillColor('black').text('REUNIDOS:', { bold: true });
        doc.moveDown(0.5);
        doc.text(`De una parte, como ARRENDADOR: ${alquiler.vendedor?.nombre || '___________________'} con DNI/CIF ${alquiler.vendedor?.dni_cif || '__________'}.`);
        doc.text(`De otra parte, como ARRENDATARIO: ${alquiler.inquilino?.nombre || '___________________'} con DNI/CIF ${alquiler.inquilino?.dni_cif || '__________'}.`);
        doc.moveDown();

        doc.text('EXPONEN:', { bold: true });
        doc.moveDown(0.5);
        doc.text(`I. Que el ARRENDADOR es propietario de la vivienda situada en ${alquiler.propiedades?.address}.`);
        doc.text(`II. Que ambas partes han acordado el arrendamiento de dicha vivienda por un importe mensual de ${alquiler.monto_mensual?.toLocaleString('es-ES')} €. El pago se realizará el día ${alquiler.dia_pago} de cada mes.`);
        doc.moveDown();

        doc.text('CLÁUSULAS:', { bold: true });
        doc.moveDown(0.5);
        doc.text('PRIMERA.- El plazo de duración del presente contrato será de UN AÑO, prorrogable según la legislación vigente.');
        doc.text(`SEGUNDA.- El ARRENDATARIO entrega en este acto la fianza legal de ____________ €.`);
        doc.moveDown(2);

        doc.text(`En Madrid, a ${new Date(alquiler.fecha_inicio).toLocaleDateString('es-ES')}`, { align: 'right' });
        doc.moveDown(3);

        const currentY = doc.y;
        doc.text('EL ARRENDADOR', 100, currentY);
        doc.text('EL ARRENDATARIO', 350, currentY);

        doc.end();

    } catch (error) {
        console.error('PDF Alquiler Generation Error:', error);
        res.status(500).json({ error: 'Error al generar contrato de alquiler' });
    }
};
