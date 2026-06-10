import { ProductRefinementSkill } from './product-refinement';

// 使用示例
async function main() {
  const skill = new ProductRefinementSkill();

  // 1. 登录
  console.log('=== 步骤1: 用户登录 ===');
  const loginSuccess = await skill.login('user@example.com', 'password123');
  
  if (!loginSuccess) {
    console.log('登录失败，请检查账号密码');
    return;
  }
  console.log('登录成功！');

  // 2. 查询积分
  console.log('\n=== 步骤2: 查询积分 ===');
  const credits = await skill.refreshCredits();
  console.log(`当前积分: ${credits}`);

  // 3. 展示功能分类
  console.log('\n=== 步骤3: 功能分类 ===');
  const categories = skill.getProductCategories();
  
  for (const [category, types] of Object.entries(categories)) {
    console.log(`\n${category}:`);
    types.forEach(type => {
      console.log(`  - ${skill.getProductTypeName(type)}`);
    });
  }

  // 4. 选择功能 - 示例：独立站轮播图
  console.log('\n=== 步骤4: 选择功能 ===');
  const selectedType = 'standalone-carousel';
  console.log(`选择的功能: ${skill.getProductTypeName(selectedType)}`);

  // 5. 查看示例
  console.log('\n=== 步骤5: 查看示例 ===');
  const example = skill.getExamplePrompt(selectedType);
  console.log('示例提示词:');
  console.log(example);

  // 6. 选择比例
  console.log('\n=== 步骤6: 选择比例 ===');
  const ratios = ['1:1', '3:4', '4:3', '16:9', '9:16'];
  console.log('可选比例:');
  ratios.forEach((ratio, index) => {
    console.log(`  ${index + 1}. ${ratio}`);
  });
  
  const selectedRatio = '16:9'; // 用户选择
  console.log(`选择的比例: ${selectedRatio}`);

  // 7. 选择模型
  console.log('\n=== 步骤7: 选择模型 ===');
  console.log('可选模型:');
  console.log('  1. nano - 快速生成，适合简单需求');
  console.log('  2. gpt - 高质量生成，适合复杂需求');
  
  const selectedModel = 'gpt'; // 用户选择
  console.log(`选择的模型: ${selectedModel}`);

  // 8. 检查积分
  console.log('\n=== 步骤8: 检查积分 ===');
  const hasEnoughCredits = skill.checkCredits(selectedType, selectedModel as any);
  const requiredCredits = skill.getRequiredCredits(selectedType, selectedModel as any);
  
  console.log(`需要积分: ${requiredCredits}`);
  console.log(`当前积分: ${credits}`);
  console.log(`积分是否足够: ${hasEnoughCredits ? '是' : '否'}`);

  if (!hasEnoughCredits) {
    console.log('积分不足，无法生成');
    return;
  }

  // 9. 生成图片
  console.log('\n=== 步骤9: 生成图片 ===');
  const generateParams = {
    type: selectedType,
    images: ['https://example.com/product1.jpg', 'https://example.com/product2.jpg'],
    title: 'Premium Wireless Headphones',
    description: 'Experience crystal-clear audio with our premium wireless headphones.',
    language: '英文',
    ratio: selectedRatio,
    model: selectedModel,
  };

  console.log('生成参数:');
  console.log(JSON.stringify(generateParams, null, 2));

  // 调用生成接口
  const result = await skill.generate(generateParams);
  
  if (result.success) {
    console.log('\n生成成功！');
    console.log(`图片URL: ${result.imageUrl}`);
    console.log(`消耗积分: ${result.creditsUsed}`);
    console.log(`剩余积分: ${result.remainingCredits}`);
  } else {
    console.log('\n生成失败:');
    console.log(result.error);
  }

  // 10. 查看图片库
  console.log('\n=== 步骤10: 查看图片库 ===');
  const gallery = await skill.getGallery();
  console.log(`图片库中共有 ${gallery.length} 张图片`);
}

// 运行示例
main().catch(console.error);
