# Tasks

- [x] 1.1 Reproducir contra la app local: `PUT /api/profile` con `{ role, inscription_admin_note }` → `500 "Email inválido"`, rol sin cambios.
- [x] 1.2 Tests: 5 que fijan el comportamiento actual (creación exige email/nombre, email inválido explícito, nombre > 200, guardado completo de Perfil) y pasan antes del arreglo; 2 del bug que fallan antes del arreglo.
- [x] 1.3 Arreglo en `createOrUpdateUser`; los 7 tests y la suite completa en verde.
- [x] 1.4 Verificación de punta a punta contra la app local: cambio a super_admin y de vuelta (200, solo cambian rol y nota) y guardado completo de Perfil (200, sin cambios de comportamiento).
