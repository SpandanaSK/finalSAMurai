SAM_MODELS = {
    'MobileSAM': {
        'model_type': 'vit_t',
        'checkpoint': './models/samv1/mobile_sam.pt'
    },
    'SAM (VIT-Base)': {
        'model_type': 'vit_b',
        'checkpoint': './models/samv1/sam_vit_b_01ec64.pth'
    },
    'SAM (VIT-Large)': {
        'model_type': 'vit_l',
        'checkpoint': './models/samv1/samsam_vit_l_0b3195.pth'
    },
    'SAM (VIT-Huge)': {
        'model_type': 'vit_h',
        'checkpoint': './models/samv1/sam_vit_h_4b8939.pth'
    },
    'SAM2.1 (Base Plus)': {
        'model_config': 'configs/sam2.1/sam2.1_hiera_b+.yaml',
        'checkpoint': './models/samv2/sam2.1_hiera_base_plus.pt'
    },
    'SAM2.1 (Tiny)': {
        'model_config': 'configs/sam2.1/sam2.1_hiera_t.yaml',
        'checkpoint': './models/samv2/sam2.1_hiera_tiny.pt'
    },
    'SAM2.1 (Large)': {
        'model_config': 'configs/sam2.1/sam2.1_hiera_l.yaml',
        'checkpoint': './models/samv2/sam2.1_hiera_large.pt'
    }
    
}