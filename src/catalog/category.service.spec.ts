import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CreateArgs = {
  data: { name: string; description: string | null };
};

type UpdateArgs = {
  where: { id: number };
  data: Record<string, unknown>;
};

type FindManyArgs = {
  select: Record<string, boolean>;
  orderBy: Record<string, string>[];
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`name`)',
    { code: 'P2002', clientVersion: '6.19.3' },
  );

const missingRecord = () =>
  new Prisma.PrismaClientKnownRequestError(
    'An operation failed because it depends on one or more records that were required but not found.',
    { code: 'P2025', clientVersion: '6.19.3' },
  );

const foreignKeyViolation = () =>
  new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint failed on the constraint: `Product_categoryId_fkey`',
    { code: 'P2003', clientVersion: '6.19.3' },
  );

describe('CategoryService', () => {
  let service: CategoryService;
  let create: jest.Mock;
  let capturedCreateArgs: CreateArgs[];
  let update: jest.Mock;
  let capturedUpdateArgs: UpdateArgs[];
  let findMany: jest.Mock;
  let capturedFindManyArgs: FindManyArgs[];
  let remove: jest.Mock;
  let capturedRemoveArgs: { where: { id: number } }[];

  const categoryRecord = {
    id: 3,
    name: 'Books',
    description: null,
    isActive: true,
  };

  beforeEach(async () => {
    capturedCreateArgs = [];
    create = jest.fn((args: CreateArgs) => {
      capturedCreateArgs.push(args);
      return Promise.resolve(categoryRecord);
    });
    capturedUpdateArgs = [];
    update = jest.fn((args: UpdateArgs) => {
      capturedUpdateArgs.push(args);
      return Promise.resolve(categoryRecord);
    });
    capturedFindManyArgs = [];
    findMany = jest.fn((args: FindManyArgs) => {
      capturedFindManyArgs.push(args);
      return Promise.resolve([categoryRecord]);
    });
    capturedRemoveArgs = [];
    remove = jest.fn((args: { where: { id: number } }) => {
      capturedRemoveArgs.push(args);
      return Promise.resolve(categoryRecord);
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: PrismaService,
          useValue: { category: { create, update, findMany, delete: remove } },
        },
      ],
    }).compile();

    service = moduleRef.get(CategoryService);
  });

  describe('createCategory', () => {
    it('persists the category with an explicit null description', async () => {
      const dto = new CreateCategoryDto();
      dto.name = 'Books';

      await expect(service.createCategory(dto)).resolves.toEqual(
        categoryRecord,
      );
      expect(capturedCreateArgs).toHaveLength(1);
      expect(capturedCreateArgs[0]?.data).toEqual({
        name: 'Books',
        description: null,
      });
    });

    it('keeps a provided description', async () => {
      const dto = new CreateCategoryDto();
      dto.name = 'Books';
      dto.description = 'Printed works';

      await service.createCategory(dto);
      expect(capturedCreateArgs[0]?.data).toEqual({
        name: 'Books',
        description: 'Printed works',
      });
    });

    it('maps a duplicate name to a conflict', async () => {
      create.mockRejectedValue(uniqueViolation());
      const dto = new CreateCategoryDto();
      dto.name = 'Books';

      await expect(service.createCategory(dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createCategory(dto)).rejects.toThrow(
        'A category with this name already exists',
      );
    });
  });

  describe('updateCategory', () => {
    it('updates only the provided fields', async () => {
      const dto = new UpdateCategoryDto();
      dto.name = 'Novels';
      dto.isActive = false;

      await expect(service.updateCategory(3, dto)).resolves.toEqual(
        categoryRecord,
      );
      expect(capturedUpdateArgs[0]?.where).toEqual({ id: 3 });
      expect(capturedUpdateArgs[0]?.data).toEqual({
        name: 'Novels',
        isActive: false,
      });
    });

    it('treats null as a real value that clears a field', async () => {
      const dto = new UpdateCategoryDto();
      dto.description = null;

      await service.updateCategory(3, dto);
      expect(capturedUpdateArgs[0]?.data).toEqual({ description: null });
    });

    it('rejects an empty patch', async () => {
      await expect(service.updateCategory(3, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a piped instance whose fields are all undefined', async () => {
      const dto = Object.assign(new UpdateCategoryDto(), {
        name: undefined,
        description: undefined,
        isActive: undefined,
      });

      await expect(service.updateCategory(3, dto)).rejects.toThrow(
        'At least one field must be provided',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('maps a missing category to not found', async () => {
      update.mockRejectedValue(missingRecord());
      const dto = new UpdateCategoryDto();
      dto.name = 'Novels';

      await expect(service.updateCategory(77, dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.updateCategory(77, dto)).rejects.toThrow(
        'Category 77 was not found',
      );
    });

    it('maps a rename collision to a conflict', async () => {
      update.mockRejectedValue(uniqueViolation());
      const dto = new UpdateCategoryDto();
      dto.name = 'Books';

      await expect(service.updateCategory(3, dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.updateCategory(3, dto)).rejects.toThrow(
        'A category with this name already exists',
      );
    });
  });

  describe('listCategories', () => {
    it('returns every category in stable name order', async () => {
      await expect(service.listCategories()).resolves.toEqual([categoryRecord]);
      expect(capturedFindManyArgs).toHaveLength(1);
      expect(capturedFindManyArgs[0]?.orderBy).toEqual([
        { name: 'asc' },
        { id: 'asc' },
      ]);
    });
  });

  describe('deleteCategory', () => {
    it('deletes by id', async () => {
      await expect(service.deleteCategory(3)).resolves.toBeUndefined();
      expect(capturedRemoveArgs).toEqual([{ where: { id: 3 } }]);
    });

    it('maps a missing category to not found', async () => {
      remove.mockRejectedValue(missingRecord());
      await expect(service.deleteCategory(77)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteCategory(77)).rejects.toThrow(
        'Category 77 was not found',
      );
    });

    it('maps a linked-products violation to a conflict', async () => {
      remove.mockRejectedValue(foreignKeyViolation());
      await expect(service.deleteCategory(3)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.deleteCategory(3)).rejects.toThrow(
        'Category still has linked products',
      );
    });
  });
});
