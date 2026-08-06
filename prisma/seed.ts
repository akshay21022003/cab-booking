import { PrismaClient, Role, CabFacility } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create IT Department
  const itDept = await prisma.department.upsert({
    where: { name: 'IT' },
    update: {},
    create: { name: 'IT', isActive: true },
  });
  console.log('✅ IT Department created');

  // 2. Create Cost Centers
  const costCenter1 = await prisma.costCenter.upsert({
    where: { code: 'IT-001' },
    update: {},
    create: { name: 'IT Operations', code: 'IT-001', departmentId: itDept.id },
  });

  const costCenter2 = await prisma.costCenter.upsert({
    where: { code: 'IT-002' },
    update: {},
    create: { name: 'IT Development', code: 'IT-002', departmentId: itDept.id },
  });
  console.log('✅ Cost Centers created');

  // 3. Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      departmentId: itDept.id,
      costCenterId: costCenter1.id,
      cabFacility: CabFacility.BOTH,
      defaultPickupLocation: 'HQ Main Gate',
      defaultPickupTime: '09:00',
      defaultDropLocation: 'HQ Main Gate',
      defaultDropTime: '18:00',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role_departmentId: { userId: superAdmin.id, role: Role.SUPER_ADMIN, departmentId: itDept.id } },
    update: {},
    create: { userId: superAdmin.id, role: Role.SUPER_ADMIN, departmentId: null },
  });
  await prisma.userRole.upsert({
    where: { userId_role_departmentId: { userId: superAdmin.id, role: Role.USER, departmentId: itDept.id } },
    update: {},
    create: { userId: superAdmin.id, role: Role.USER, departmentId: itDept.id },
  });
  console.log('✅ Super Admin created (admin@company.com) - Facility: BOTH');

  // 4. Department Admin
  const deptAdmin = await prisma.user.upsert({
    where: { email: 'it-admin@company.com' },
    update: {},
    create: {
      email: 'it-admin@company.com',
      departmentId: itDept.id,
      costCenterId: costCenter1.id,
      cabFacility: CabFacility.BOTH,
      defaultPickupLocation: 'HQ Main Gate',
      defaultPickupTime: '09:00',
      defaultDropLocation: 'Branch Office A',
      defaultDropTime: '18:00',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role_departmentId: { userId: deptAdmin.id, role: Role.DEPARTMENT_ADMIN, departmentId: itDept.id } },
    update: {},
    create: { userId: deptAdmin.id, role: Role.DEPARTMENT_ADMIN, departmentId: itDept.id },
  });
  await prisma.userRole.upsert({
    where: { userId_role_departmentId: { userId: deptAdmin.id, role: Role.USER, departmentId: itDept.id } },
    update: {},
    create: { userId: deptAdmin.id, role: Role.USER, departmentId: itDept.id },
  });
  await prisma.departmentAdmin.upsert({
    where: { departmentId_userId: { departmentId: itDept.id, userId: deptAdmin.id } },
    update: {},
    create: { departmentId: itDept.id, userId: deptAdmin.id },
  });
  console.log('✅ Department Admin created (it-admin@company.com) - Facility: BOTH');

  // 5. Test Employees with different cab facilities
  const employees = [
    {
      email: 'john@company.com',
      costCenterId: costCenter1.id,
      cabFacility: CabFacility.BOTH,
      defaultPickupLocation: 'HQ Main Gate',
      defaultPickupTime: '09:00',
      defaultDropLocation: 'Tech Park B2',
      defaultDropTime: '18:00',
    },
    {
      email: 'jane@company.com',
      costCenterId: costCenter2.id,
      cabFacility: CabFacility.PICKUP_ONLY,
      defaultPickupLocation: 'Metro Station Exit 3',
      defaultPickupTime: '08:30',
      defaultDropLocation: null,
      defaultDropTime: null,
    },
    {
      email: 'mike@company.com',
      costCenterId: costCenter1.id,
      cabFacility: CabFacility.DROP_ONLY,
      defaultPickupLocation: null,
      defaultPickupTime: null,
      defaultDropLocation: 'Sector 15 Bus Stop',
      defaultDropTime: '19:00',
    },
  ];

  for (const emp of employees) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: { ...emp, departmentId: itDept.id },
    });

    await prisma.userRole.upsert({
      where: { userId_role_departmentId: { userId: user.id, role: Role.USER, departmentId: itDept.id } },
      update: {},
      create: { userId: user.id, role: Role.USER, departmentId: itDept.id },
    });
  }
  console.log('✅ Test employees created:');
  console.log('   john@company.com  - Facility: BOTH');
  console.log('   jane@company.com  - Facility: PICKUP_ONLY');
  console.log('   mike@company.com  - Facility: DROP_ONLY');

  // 6. Create past bookings for john@company.com
  const emp001 = await prisma.user.findUnique({ where: { email: 'john@company.com' } });
  if (emp001) {
    const pastBookings = [];
    for (let i = 1; i <= 25; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const types = ['BOTH', 'PICKUP', 'DROP'] as const;
      const bookingType = types[i % 3];

      pastBookings.push({
        userId: emp001.id,
        bookingDate: date,
        bookingType,
        pickupLocation: bookingType !== 'DROP' ? 'HQ Main Gate' : null,
        pickupTime: bookingType !== 'DROP' ? '09:00' : null,
        dropLocation: bookingType !== 'PICKUP' ? 'Tech Park B2' : null,
        dropTime: bookingType !== 'PICKUP' ? '18:00' : null,
        departmentId: itDept.id,
        costCenterId: costCenter1.id,
      });
    }

    for (const booking of pastBookings) {
      await prisma.booking.create({ data: booking });
    }
    console.log('✅ 25 past bookings created for john@company.com');
  }

  console.log('\n🎉 Seed completed!\n');
  console.log('📋 Login credentials (email):');
  console.log('  Super Admin:  admin@company.com');
  console.log('  Dept Admin:   it-admin@company.com');
  console.log('  Employees:    john@company.com (both), jane@company.com (pickup only), mike@company.com (drop only)');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
