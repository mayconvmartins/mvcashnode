import { PrismaClient } from '@mvcashnode/db';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function testPasswordFlow() {
  console.log('🧪 Iniciando testes de fluxo de senhas...\n');

  const testEmail = `test-password-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const newPassword = 'NewPassword456!';

  try {
    // Teste 1: Criar usuário com senha
    console.log('📝 Teste 1: Criar usuário com senha');
    const passwordHash1 = await bcrypt.hash(testPassword, 12);
    console.log('  Hash gerado:', {
      length: passwordHash1.length,
      prefix: passwordHash1.substring(0, 20) + '...',
      full: passwordHash1
    });

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password_hash: passwordHash1,
        is_active: true,
        must_change_password: false,
        profile: {
          create: {
            full_name: 'Test User',
          },
        },
        roles: {
          create: {
            role: 'user',
          },
        },
      },
    });

    console.log('  ✅ Usuário criado com ID:', user.id);

    // Verificar se hash foi salvo corretamente
    const savedUser1 = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });

    console.log('  Hash salvo no banco:', {
      length: savedUser1?.password_hash.length,
      prefix: savedUser1?.password_hash.substring(0, 20) + '...',
      full: savedUser1?.password_hash,
      matches: savedUser1?.password_hash === passwordHash1
    });

    // Testar verificação
    const verify1 = await bcrypt.compare(testPassword, savedUser1!.password_hash);
    console.log('  Verificação de senha:', verify1 ? '✅ PASSOU' : '❌ FALHOU');

    if (!verify1) {
      throw new Error('Falha na verificação após criar usuário');
    }

    // Teste 2: Alterar senha via adminChangePassword
    console.log('\n📝 Teste 2: Alterar senha (adminChangePassword)');
    const passwordHash2 = await bcrypt.hash(newPassword, 12);
    console.log('  Novo hash gerado:', {
      length: passwordHash2.length,
      prefix: passwordHash2.substring(0, 20) + '...',
      full: passwordHash2
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash2,
      },
    });

    // Verificar se hash foi salvo corretamente
    const savedUser2 = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });

    console.log('  Hash salvo no banco:', {
      length: savedUser2?.password_hash.length,
      prefix: savedUser2?.password_hash.substring(0, 20) + '...',
      full: savedUser2?.password_hash,
      matches: savedUser2?.password_hash === passwordHash2
    });

    // Testar verificação com nova senha
    const verify2 = await bcrypt.compare(newPassword, savedUser2!.password_hash);
    console.log('  Verificação com nova senha:', verify2 ? '✅ PASSOU' : '❌ FALHOU');

    // Testar verificação com senha antiga (deve falhar)
    const verify3 = await bcrypt.compare(testPassword, savedUser2!.password_hash);
    console.log('  Verificação com senha antiga (deve falhar):', verify3 ? '❌ FALHOU (deveria falhar)' : '✅ PASSOU');

    if (!verify2 || verify3) {
      throw new Error('Falha na verificação após alterar senha');
    }

    // Teste 3: Alterar senha novamente
    console.log('\n📝 Teste 3: Alterar senha novamente');
    const passwordHash3 = await bcrypt.hash('AnotherPassword789!', 12);
    console.log('  Novo hash gerado:', {
      length: passwordHash3.length,
      prefix: passwordHash3.substring(0, 20) + '...',
      full: passwordHash3
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash3,
      },
    });

    const savedUser3 = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });

    const verify4 = await bcrypt.compare('AnotherPassword789!', savedUser3!.password_hash);
    console.log('  Verificação com terceira senha:', verify4 ? '✅ PASSOU' : '❌ FALHOU');

    if (!verify4) {
      throw new Error('Falha na verificação após segunda alteração');
    }

    // Teste 4: Verificar tamanho do hash
    console.log('\n📝 Teste 4: Verificar tamanho do hash');
    const hashLengths = [
      passwordHash1.length,
      passwordHash2.length,
      passwordHash3.length,
      savedUser1!.password_hash.length,
      savedUser2!.password_hash.length,
      savedUser3!.password_hash.length
    ];
    const maxLength = Math.max(...hashLengths);
    const minLength = Math.min(...hashLengths);
    console.log('  Tamanhos de hash:', {
      min: minLength,
      max: maxLength,
      all: hashLengths
    });

    if (maxLength > 255) {
      console.log('  ⚠️  AVISO: Hash maior que 255 caracteres! Campo deve ser TEXT.');
    } else {
      console.log('  ✅ Todos os hashes têm menos de 255 caracteres');
    }

    // Limpeza
    console.log('\n🧹 Limpando dados de teste...');
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log('  ✅ Dados de teste removidos');

    console.log('\n✅ Todos os testes passaram!');
  } catch (error: any) {
    console.error('\n❌ Erro nos testes:', error.message);
    console.error(error);
    
    // Tentar limpar em caso de erro
    try {
      const userToDelete = await prisma.user.findUnique({
        where: { email: testEmail },
      });
      if (userToDelete) {
        await prisma.user.delete({
          where: { id: userToDelete.id },
        });
        console.log('  ✅ Dados de teste removidos após erro');
      }
    } catch (cleanupError) {
      console.error('  ⚠️  Erro ao limpar dados de teste:', cleanupError);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordFlow();

