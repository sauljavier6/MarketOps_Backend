import type { Request, Response } from "express";
import { Op } from "sequelize";
import Product from "../models/Product";
import Stock from "../models/Stock";
import Supplier from "../models/Supplier";

export async function getProducts(req: Request, res: Response) {
  const includeInactive = String(req.query.includeInactive || "false") === "true";
  const search = String(req.query.search || "").trim();

  const where: any = {};
  if (!includeInactive) where.State = true;

  if (search) {
    where[Op.or] = [
      { Description: { [Op.iLike]: `%${search}%` } },
      { Code: { [Op.iLike]: `%${search}%` } },
      { Brand: { [Op.iLike]: `%${search}%` } },
      { Category: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const rows = await Product.findAll({ where, include: [Stock], order: [["State", "DESC"], ["Description", "ASC"]] });
  res.json(rows);
}

export async function createProduct(req: Request, res: Response) {
  const { description, code, brand, category, targetPurchasePrice, salePrice = 0 } = req.body;
  if (!description || !code) return res.status(400).json({ error: "description and code are required" });

  const existing = await Product.findOne({ where: { Code: code } });
  if (existing) return res.status(409).json({ error: "Ya existe un producto con ese SKU" });

  const product = await Product.create({
    Description: String(description).trim(),
    Code: String(code).trim(),
    Brand: brand ? String(brand).trim() : null,
    Category: category ? String(category).trim() : null,
    TargetPurchasePrice: targetPurchasePrice === "" || targetPurchasePrice == null ? null : Number(targetPurchasePrice),
    State: true,
  });

  await Stock.create({
    ID_Product: product.ID_Product,
    Amount: 0,
    AveragePurchasePrice: 0,
    SalePrice: Number(salePrice || 0),
    Reserved: 0,
  });

  const created = await Product.findByPk(product.ID_Product, { include: [Stock] });
  res.status(201).json(created);
}

export async function updateProduct(req: Request, res: Response) {
  const productId = Number(req.params.productId);
  const product = await Product.findByPk(productId, { include: [Stock] });
  if (!product) return res.status(404).json({ error: "Producto no encontrado" });

  const { description, code, brand, category, targetPurchasePrice, salePrice, state } = req.body;

  if (code && code !== product.Code) {
    const duplicate = await Product.findOne({ where: { Code: code, ID_Product: { [Op.ne]: productId } } });
    if (duplicate) return res.status(409).json({ error: "Ya existe otro producto con ese SKU" });
  }

  if (description !== undefined) product.Description = String(description).trim();
  if (code !== undefined) product.Code = String(code).trim();
  if (brand !== undefined) product.Brand = brand ? String(brand).trim() : undefined;
  if (category !== undefined) product.Category = category ? String(category).trim() : undefined;
  if (targetPurchasePrice !== undefined) product.TargetPurchasePrice = targetPurchasePrice === "" || targetPurchasePrice == null ? undefined : Number(targetPurchasePrice);
  if (state !== undefined) product.State = Boolean(state);

  await product.save();

  if (salePrice !== undefined) {
    let stock = await Stock.findByPk(productId);
    if (!stock) {
      stock = await Stock.create({ ID_Product: productId, Amount: 0, AveragePurchasePrice: 0, SalePrice: Number(salePrice || 0), Reserved: 0 });
    } else {
      stock.SalePrice = Number(salePrice || 0);
      await stock.save();
    }
  }

  const updated = await Product.findByPk(productId, { include: [Stock] });
  return res.json(updated);
}

export async function deactivateProduct(req: Request, res: Response) {
  const productId = Number(req.params.productId);
  const product = await Product.findByPk(productId);
  if (!product) return res.status(404).json({ error: "Producto no encontrado" });

  product.State = false;
  await product.save();

  return res.json({ success: true, message: "Producto desactivado", productId });
}

export async function getSuppliers(_req: Request, res: Response) {
  const rows = await Supplier.findAll({ order: [["Name", "ASC"]] });
  res.json(rows);
}

export async function createSupplier(req: Request, res: Response) {
  const { name, contact, phone, website } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const supplier = await Supplier.create({ Name: name, Contact: contact || null, Phone: phone || null, Website: website || null });
  res.status(201).json(supplier);
}
