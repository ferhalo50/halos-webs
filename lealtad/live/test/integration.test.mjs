import test from 'node:test';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8787';
const bootstrapSecret = 'local-test-bootstrap';
const adminUsername = 'admin_local';
const adminPassword = 'Admin-test-928!';
const employeeUsername = 'mostrador_local';
const employeePassword = 'Staff-test-928!';

async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

test('real backend flow', async () => {
  const health = await request('/api/health');
  assert.equal(health.status, 200);

  const setup = await request('/api/setup', {
    method: 'POST',
    headers: { 'x-bootstrap-secret': bootstrapSecret },
    body: { adminUsername, adminPassword, adminName: 'Administración Renace', employeeUsername, employeePassword, employeeName: 'Mostrador Renace' }
  });
  assert.ok([201, 409].includes(setup.status));

  const staffLogin = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: employeeUsername, password: employeePassword } });
  assert.equal(staffLogin.status, 200);
  assert.match(staffLogin.cookie, /^renace_session=/);

  const unique = String(Date.now()).slice(-7);
  const phone = `664${unique}`;
  const registration = await request('/api/register', { method: 'POST', body: { business: 'renace', name: 'Cliente de prueba', phone, pin: '4826' } });
  assert.equal(registration.status, 201);
  const clientCookie = registration.cookie;

  const initialCard = await request('/api/card', { cookie: clientCookie });
  assert.equal(initialCard.status, 200);
  assert.equal(initialCard.data.card.stamps, 0);
  assert.equal(initialCard.data.card.canStampToday, true);

  const changedPin = await request('/api/account/secret', { method: 'POST', cookie: clientCookie, body: { currentSecret: '4826', newSecret: '4827' } });
  assert.equal(changedPin.status, 200);
  const oldPinLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone, pin: '4826' } });
  assert.equal(oldPinLogin.status, 401);
  const newPinLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone, pin: '4827' } });
  assert.equal(newPinLogin.status, 200);

  const lookup = await request(`/api/staff/card?value=${encodeURIComponent(initialCard.data.card.qrValue)}`, { cookie: staffLogin.cookie });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.card.phone, phone);

  const stamp = await request('/api/staff/stamp', { method: 'POST', cookie: staffLogin.cookie, body: { cardId: lookup.data.card.id } });
  assert.equal(stamp.status, 200);
  assert.equal(stamp.data.card.stamps, 1);
  assert.equal(stamp.data.card.canStampToday, false);

  const duplicateStamp = await request('/api/staff/stamp', { method: 'POST', cookie: staffLogin.cookie, body: { cardId: lookup.data.card.id } });
  assert.equal(duplicateStamp.status, 409);
  assert.equal(duplicateStamp.data.error.code, 'already_stamped_today');

  const racePhone = `663${unique}`;
  const raceRegistration = await request('/api/register', { method: 'POST', body: { business: 'renace', name: 'Cliente simultáneo', phone: racePhone, pin: '1947' } });
  const raceCard = await request('/api/card', { cookie: raceRegistration.cookie });
  const simultaneous = await Promise.all([
    request('/api/staff/stamp', { method: 'POST', cookie: staffLogin.cookie, body: { cardId: raceCard.data.card.id } }),
    request('/api/staff/stamp', { method: 'POST', cookie: staffLogin.cookie, body: { cardId: raceCard.data.card.id } })
  ]);
  assert.deepEqual(simultaneous.map(item => item.status).sort(), [200, 409]);

  const earlyRedeem = await request('/api/staff/redeem', { method: 'POST', cookie: staffLogin.cookie, body: { cardId: lookup.data.card.id } });
  assert.equal(earlyRedeem.status, 409);

  const adminLogin = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: adminUsername, password: adminPassword } });
  assert.equal(adminLogin.status, 200);
  const demoReset = await request('/api/admin/demo-customers/reset', { method: 'POST', cookie: adminLogin.cookie });
  assert.equal(demoReset.status, 200);
  assert.deepEqual(demoReset.data.demo.customers.map(customer => [customer.phone, customer.stamps]), [['0000000001', 0], ['0000000008', 8]]);
  assert.equal(demoReset.data.demo.pin, '246810');
  for (const [demoPhone, expectedStamps] of [['0000000001', 0], ['0000000008', 8]]) {
    const demoLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone: demoPhone, pin: '246810' } });
    assert.equal(demoLogin.status, 200);
    const demoCard = await request('/api/card', { cookie: demoLogin.cookie });
    assert.equal(demoCard.status, 200);
    assert.equal(demoCard.data.card.stamps, expectedStamps);
    assert.equal(demoCard.data.card.redeemed, 0);
    assert.equal(demoCard.data.card.lastStampAt, null);
  }
  const dashboard = await request('/api/admin/dashboard', { cookie: adminLogin.cookie });
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.data.customers.some(customer => customer.phone === phone));
  assert.equal(dashboard.data.customerPage.page, 1);
  assert.ok(dashboard.data.customerPage.perPage <= 100);
  assert.ok(Number(dashboard.data.metrics.stamps_today) >= 1);

  const customerSearch = await request(`/api/admin/dashboard?q=${phone}&perPage=5`, { cookie: adminLogin.cookie });
  assert.equal(customerSearch.status, 200);
  assert.equal(customerSearch.data.customerPage.search, phone);
  assert.equal(customerSearch.data.customers.length, 1);
  assert.equal(customerSearch.data.customers[0].phone, phone);

  const resetPin = await request(`/api/admin/customers/${customerSearch.data.customers[0].customer_id}/pin`, {
    method: 'PATCH', cookie: adminLogin.cookie
  });
  assert.equal(resetPin.status, 200);
  assert.match(resetPin.data.customer.temporaryPin, /^\d{6}$/);
  const closedCustomerSession = await request('/api/card', { cookie: newPinLogin.cookie });
  assert.equal(closedCustomerSession.status, 401);
  const previousPinLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone, pin: '4827' } });
  assert.equal(previousPinLogin.status, 401);
  const temporaryPinLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone, pin: resetPin.data.customer.temporaryPin } });
  assert.equal(temporaryPinLogin.status, 200);
  assert.equal(temporaryPinLogin.data.user.mustChangeSecret, true);
  const blockedCard = await request('/api/card', { cookie: temporaryPinLogin.cookie });
  assert.equal(blockedCard.status, 403);
  assert.equal(blockedCard.data.error.code, 'secret_change_required');
  const ownPin = await request('/api/account/secret', { method: 'POST', cookie: temporaryPinLogin.cookie, body: { currentSecret: resetPin.data.customer.temporaryPin, newSecret: '5931' } });
  assert.equal(ownPin.status, 200);
  const reopenedCard = await request('/api/card', { cookie: temporaryPinLogin.cookie });
  assert.equal(reopenedCard.status, 200);
  const dashboardAfterReset = await request('/api/admin/dashboard', { cookie: adminLogin.cookie });
  assert.ok(dashboardAfterReset.data.events.some(event => event.event_type === 'pin_reset'));

  const employee = await request('/api/admin/employees', { method: 'POST', cookie: adminLogin.cookie, body: { name: 'Empleado temporal', username: `temp_${unique}`, password: 'Temporal-928!' } });
  assert.equal(employee.status, 201);
  const disabled = await request(`/api/admin/employees/${employee.data.employee.id}`, { method: 'PATCH', cookie: adminLogin.cookie, body: { active: false } });
  assert.equal(disabled.status, 200);
  const enabled = await request(`/api/admin/employees/${employee.data.employee.id}`, { method: 'PATCH', cookie: adminLogin.cookie, body: { active: true } });
  assert.equal(enabled.status, 200);
  const editedUsername = `edit_${unique}`;
  const editedEmployee = await request(`/api/admin/employees/${employee.data.employee.id}`, { method: 'PUT', cookie: adminLogin.cookie, body: { name: 'Empleado editado', username: editedUsername } });
  assert.equal(editedEmployee.status, 200);
  const editedEmployeeLogin = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: editedUsername, password: 'Temporal-928!' } });
  assert.equal(editedEmployeeLogin.status, 200);
  const deletedEmployee = await request(`/api/admin/employees/${employee.data.employee.id}`, { method: 'DELETE', cookie: adminLogin.cookie });
  assert.equal(deletedEmployee.status, 200);
  const deletedEmployeeLogin = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: editedUsername, password: 'Temporal-928!' } });
  assert.equal(deletedEmployeeLogin.status, 401);

  const editedPhone = `665${unique}`;
  const editedCustomer = await request(`/api/admin/customers/${raceRegistration.data.user.id}`, { method: 'PUT', cookie: adminLogin.cookie, body: { name: 'Cliente editado', phone: editedPhone } });
  assert.equal(editedCustomer.status, 200);
  const closedEditedSession = await request('/api/card', { cookie: raceRegistration.cookie });
  assert.equal(closedEditedSession.status, 401);
  const oldPhoneLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone: racePhone, pin: '1947' } });
  assert.equal(oldPhoneLogin.status, 401);
  const editedCustomerLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone: editedPhone, pin: '1947' } });
  assert.equal(editedCustomerLogin.status, 200);
  const deletedCustomer = await request(`/api/admin/customers/${raceRegistration.data.user.id}`, { method: 'DELETE', cookie: adminLogin.cookie });
  assert.equal(deletedCustomer.status, 200);
  const deletedCustomerCard = await request('/api/card', { cookie: editedCustomerLogin.cookie });
  assert.equal(deletedCustomerCard.status, 401);
  const deletedCustomerLogin = await request('/api/login/customer', { method: 'POST', body: { business: 'renace', phone: editedPhone, pin: '1947' } });
  assert.equal(deletedCustomerLogin.status, 401);
  const invalidatedQr = await request(`/api/staff/card?value=${encodeURIComponent(raceCard.data.card.qrValue)}`, { cookie: staffLogin.cookie });
  assert.equal(invalidatedQr.status, 404);

  const dashboardAfterManagement = await request('/api/admin/dashboard', { cookie: adminLogin.cookie });
  assert.ok(dashboardAfterManagement.data.events.some(event => event.event_type === 'demo_reset'));
  for (const action of ['customer_updated', 'customer_deleted', 'employee_updated', 'employee_deleted']) {
    assert.ok(dashboardAfterManagement.data.events.some(event => event.event_type === action));
  }

  const unauthorized = await request('/api/admin/dashboard');
  assert.equal(unauthorized.status, 401);
  const badOrigin = await request('/api/logout', { method: 'POST', cookie: adminLogin.cookie, headers: { origin: 'https://example.com' } });
  assert.equal(badOrigin.status, 403);

  const blockedUsername = `missing_${unique}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: blockedUsername, password: 'incorrecta' } });
    assert.equal(failed.status, 401);
  }
  const blocked = await request('/api/login/staff', { method: 'POST', body: { business: 'renace', username: blockedUsername, password: 'incorrecta' } });
  assert.equal(blocked.status, 429);
});
