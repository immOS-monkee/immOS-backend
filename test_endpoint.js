const jwt = require('jsonwebtoken');

async function testEndpoint() {
    try {
        require('dotenv').config();
        
        const superAdminToken = jwt.sign(
            { id: '11111111-2222-3333-4444-555555555555', rol: 'super_admin' },
            process.env.ACCESS_TOKEN_SECRET || 'dev_secret_key_access_2024',
            { expiresIn: '1h' }
        );

        console.log("Intentando POST /api/admin/users con rol 'propietario'...");
        
        const response = await fetch('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `refreshToken=test;`, 
                'Authorization': `Bearer ${superAdminToken}`
            },
            body: JSON.stringify({
                nombre: "Test Propietario UI",
                email: `prop_ui_${Date.now()}@inmoos.com`,
                password: "pstrongpassword",
                rol: "propietario"
            })
        });
        
        const data = await response.json();
        console.log(`Status: ${response.status}`);
        console.log("Respuesta:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("\nError Request:", err.message);
    }
}

testEndpoint();
