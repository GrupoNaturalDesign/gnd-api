import { Router } from 'express';
import { productImagesController } from '../controllers/productImages.controller';
import { uploadMultiple } from '../middleware/upload.middleware';

const router = Router();

// POST /api/product-images/upload
router.post(
  '/upload',
  uploadMultiple('images', 10),
  productImagesController.uploadImages.bind(productImagesController)
);

// GET /api/product-images/:productoWebId
router.get(
  '/:productoWebId',
  productImagesController.getImages.bind(productImagesController)
);

// GET /api/product-images/:productoWebId/colors
router.get(
  '/:productoWebId/colors',
  productImagesController.getColors.bind(productImagesController)
);

// GET /api/product-images/:productoWebId/by-color
router.get(
  '/:productoWebId/by-color',
  productImagesController.getImagesByColor.bind(productImagesController)
);

// GET /api/product-images/producto-padre/:productoPadreId (debe ir antes de /:productoWebId)
router.get(
  '/producto-padre/:productoPadreId',
  productImagesController.getProductoPadreImages.bind(productImagesController)
);

// PATCH /api/product-images/reorder (debe ir antes de /:imageId)
router.patch(
  '/reorder',
  productImagesController.reorderImages.bind(productImagesController)
);

// DELETE /api/product-images/:imageId
router.delete(
  '/:imageId',
  productImagesController.deleteImage.bind(productImagesController)
);

export default router;

