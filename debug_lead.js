async function testLead() {
  try {
    const res = await fetch('http://localhost:5000/api/v1/leads/publico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: "angela test db",
        telefono: "+584142006046",
        descripcion_busqueda: "Mensaje de prueba",
        zona_interes: "norte",
        origen: "Facebook",
        tipo_lead: "visita",
        fecha_visita: "2026-03-12",
        hora_visita: "09:30"
      })
    });
    
    const data = await res.text();
    console.log("STATUS HTTP:", res.status);
    console.log("RESPONSE:", data);
  } catch (error) {
    console.log("ERROR RED:", error.message);
  }
}

testLead();
