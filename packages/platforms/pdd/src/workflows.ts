import {
  AddGoodsResultSchema,
  ImageFileSchema,
  ProductDataSchema,
  PddOrderSchema,
  type AddGoodsParams,
  type AddGoodsResult,
  type ImageFile,
  type LogisticsInfo,
  type OrderDetail,
  type PddOrder,
  type ProductData
} from "./schemas.js";

export interface ProductPublisher {
  addGoods(params: AddGoodsParams): Promise<AddGoodsResult>;
}

export interface PublishProductOptions {
  client: ProductPublisher;
  resolveCategory?: (product: ProductData) => Promise<string>;
  uploadImage?: (image: ImageFile) => Promise<string>;
}

export async function publishProduct(
  product: ProductData,
  images: ImageFile[],
  options: PublishProductOptions
): Promise<AddGoodsResult> {
  const parsedProduct = ProductDataSchema.parse(product);
  const parsedImages = images.map((image) => ImageFileSchema.parse(image));
  const categoryId = options.resolveCategory
    ? await options.resolveCategory(parsedProduct)
    : parsedProduct.categoryId;
  const uploadedImages: (string | undefined)[] = await Promise.all(
    parsedImages.map((image) => image.url ?? options.uploadImage?.(image))
  );
  const imageUrls = uploadedImages.filter(
    (url): url is string => typeof url === "string" && url.length > 0
  );
  const result = await options.client.addGoods({
    ...parsedProduct,
    categoryId,
    images: imageUrls
  });

  return AddGoodsResultSchema.parse(result);
}

export interface OrderProcessorPddClient {
  getOrderDetail(orderSn: string): Promise<OrderDetail>;
  sendGoods(orderSn: string, logistics: LogisticsInfo): Promise<void>;
}

export interface SupplierOrderService {
  createOrder(order: OrderDetail): Promise<{ supplierOrderId: string }>;
  getLogistics(supplierOrderId: string): Promise<LogisticsInfo>;
}

export interface ProcessOrderOptions {
  pddClient: OrderProcessorPddClient;
  supplierOrderService: SupplierOrderService;
}

export async function processOrder(
  order: PddOrder,
  options: ProcessOrderOptions
): Promise<{
  success: boolean;
  trackingNumber?: string;
  error?: string;
}> {
  try {
    const parsedOrder = PddOrderSchema.parse(order);
    const detail = await options.pddClient.getOrderDetail(parsedOrder.orderSn);
    const supplierOrder =
      await options.supplierOrderService.createOrder(detail);
    const logistics = await options.supplierOrderService.getLogistics(
      supplierOrder.supplierOrderId
    );
    await options.pddClient.sendGoods(parsedOrder.orderSn, logistics);

    return {
      success: true,
      trackingNumber: logistics.trackingNumber
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown PDD order processing error"
    };
  }
}
