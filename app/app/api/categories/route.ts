import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        parentId: null, // Тільки головні категорії
      },
      orderBy: {
        sortOrder: 'asc',
      },
      include: {
        children: {
          where: {
            isActive: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    // Якщо категорій немає в БД, повертаємо статичні дані
    if (categories.length === 0) {
      return NextResponse.json([]);
    }

    const formattedCategories = categories.map((cat) => ({
      id: cat.id.toString(),
      name: cat.name,
      icon: cat.icon,
      subcategories: cat.children.map((child) => ({
        id: child.id.toString(),
        name: child.name,
      })),
    }));

    return NextResponse.json(formattedCategories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

